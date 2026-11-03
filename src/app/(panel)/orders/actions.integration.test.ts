import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { fulfillments, orders, plans, promotionRedemptions, promotions } from "@/server/db/schema";
import { createPlanOrder } from "@/server/domain/orders";
import { installFakeServers, prepareDatabase, readPool, resetDatabase, seedPlan, seedPool, seedUser } from "@/server/test/helpers";

const current = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/server/session", () => ({ requireSession: async () => ({ user: { id: current.userId } }) }));

import { cancelMyOrder } from "./actions";

const Q = 1_000_000;
let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function setup() {
  const plan = await seedPlan({ creditQuota: Q, priceIdr: 55_000 });
  await seedPool(5 * Q);
  const me = await seedUser();
  current.userId = me.id;
  return { plan, me };
}

const statusOf = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0].status;

describe("cancelMyOrder", () => {
  it("allows 10 attempts per minute per user, then answers with the rate-limit message", async () => {
    await setup();
    const missing = "00000000-0000-4000-8000-000000000000"; // a well-formed id passes the format check, which runs before the limiter
    for (let i = 0; i < 10; i++) expect(await cancelMyOrder(missing)).toEqual({ error: "Pesanan tidak ditemukan." });
    expect(await cancelMyOrder(missing)).toEqual({ error: "Terlalu banyak percobaan. Coba lagi dalam satu menit." });
    current.userId = (await seedUser()).id;
    expect(await cancelMyOrder(missing)).toEqual({ error: "Pesanan tidak ditemukan." });
  });

  it("cancels a pending order: Poketo invoice, pool reservation and plan stock are released", async () => {
    const { plan, me } = await setup();
    const { orderId, tradeNo } = await createPlanOrder({ userId: me.id, planId: plan.id });
    expect((await readPool()).reservedQuota).toBe(Q);

    expect(await cancelMyOrder(orderId)).toEqual({ cancelled: true });

    expect(await statusOf(orderId)).toBe("cancelled");
    expect(fake.invoices.get(tradeNo)?.status).toBe("cancelled");
    expect((await readPool()).reservedQuota).toBe(0);
    expect((await db.select().from(plans).where(eq(plans.id, plan.id)))[0].soldCount).toBe(0);
  });

  it("gives the promo redemption back", async () => {
    const { plan, me } = await setup();
    const [promo] = await db
      .insert(promotions)
      .values({ name: "Promo uji", code: "HEMAT", kind: "percent", value: 10, perUserLimit: 1, maxRedemptions: 1 })
      .returning();
    const { orderId } = await createPlanOrder({ userId: me.id, planId: plan.id, promoCode: "HEMAT" });
    expect((await db.select().from(promotions).where(eq(promotions.id, promo.id)))[0].redeemedCount).toBe(1);

    await cancelMyOrder(orderId);

    expect((await db.select().from(promotions).where(eq(promotions.id, promo.id)))[0].redeemedCount).toBe(0);
    expect((await db.select().from(promotionRedemptions).where(eq(promotionRedemptions.orderId, orderId)))[0].status).toBe("released");
  });

  it("refuses another user's order and an unknown or malformed id, with no effect", async () => {
    const { plan, me } = await setup();
    const { orderId } = await createPlanOrder({ userId: me.id, planId: plan.id });
    current.userId = (await seedUser()).id;

    expect(await cancelMyOrder(orderId)).toEqual({ error: "Pesanan tidak ditemukan." });
    expect(await cancelMyOrder("00000000-0000-4000-8000-000000000000")).toEqual({ error: "Pesanan tidak ditemukan." });
    expect(await cancelMyOrder("nope")).toEqual({ error: "Pesanan tidak ditemukan." });

    expect(await statusOf(orderId)).toBe("pending");
    expect((await readPool()).reservedQuota).toBe(Q);
    expect(fake.state.calls.some((c) => c.endsWith("/cancel"))).toBe(false);
  });

  it("refuses a non-pending order without touching Poketo", async () => {
    const { plan, me } = await setup();
    const { orderId } = await createPlanOrder({ userId: me.id, planId: plan.id });
    await db.update(orders).set({ status: "expired" }).where(eq(orders.id, orderId));
    fake.state.calls.length = 0;

    expect(await cancelMyOrder(orderId)).toEqual({ error: "Pesanan ini sudah tidak menunggu pembayaran." });

    expect(await statusOf(orderId)).toBe("expired");
    expect(fake.state.calls).toEqual([]);
  });

  it("settles instead of cancelling when Poketo already has the payment", async () => {
    const { plan, me } = await setup();
    const { orderId, tradeNo } = await createPlanOrder({ userId: me.id, planId: plan.id });
    fake.invoices.get(tradeNo)!.status = "paid";

    const result = await cancelMyOrder(orderId);

    expect(result).toMatchObject({ paid: true, notice: expect.stringMatching(/Pembayaran sudah kami terima/) });
    expect(await statusOf(orderId)).toBe("paid");
    expect((await readPool()).soldQuota).toBe(Q);
    expect(await db.select().from(fulfillments).where(eq(fulfillments.orderId, orderId))).toHaveLength(1);
    expect(fake.state.calls.some((c) => c.endsWith("/cancel"))).toBe(false);
  });

  it("still cancels locally when cancelling the invoice at Poketo fails", async () => {
    const { plan, me } = await setup();
    const { orderId } = await createPlanOrder({ userId: me.id, planId: plan.id });
    fake.state.failCancel = true;

    expect(await cancelMyOrder(orderId)).toEqual({ cancelled: true });

    expect(await statusOf(orderId)).toBe("cancelled");
    expect((await readPool()).reservedQuota).toBe(0);
    expect(console.warn).toHaveBeenCalledWith("[orders] invoice cancel failed, cancelling locally", expect.objectContaining({ error: expect.any(String) }));
  });

  it("is idempotent: the second cancel changes nothing and does not call Poketo again", async () => {
    const { plan, me } = await setup();
    const { orderId } = await createPlanOrder({ userId: me.id, planId: plan.id });
    await cancelMyOrder(orderId);
    fake.state.calls.length = 0;

    expect(await cancelMyOrder(orderId)).toEqual({ cancelled: true });

    expect(fake.state.calls).toEqual([]);
    expect((await readPool()).reservedQuota).toBe(0);
    expect((await db.select().from(plans).where(eq(plans.id, plan.id)))[0].soldCount).toBe(0);
  });

  it("frees the buyer to order again", async () => {
    const { plan, me } = await setup();
    const { orderId } = await createPlanOrder({ userId: me.id, planId: plan.id });
    await cancelMyOrder(orderId);

    await expect(createPlanOrder({ userId: me.id, planId: plan.id })).resolves.toMatchObject({ tradeNo: expect.stringMatching(/^ADX-/) });
  });
});
