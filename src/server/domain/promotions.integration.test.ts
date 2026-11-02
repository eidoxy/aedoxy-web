import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { orders, promotionRedemptions, promotions } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, readPool, resetDatabase, seedPlan, seedPool, seedUser } from "@/server/test/helpers";
import { sweepPendingOrders } from "./order-sweeper";
import { cancelOrder, createPlanOrder, expireOrder, OrderError, settleOrderPaid } from "./orders";
import { quotePlans } from "./promotions";

const Q = 10_000_000;
const HOUR = 3_600_000;

let fake: ReturnType<typeof installFakeServers>;
let plan: Awaited<ReturnType<typeof seedPlan>>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
  await seedPool(1000 * Q);
  plan = await seedPlan({ creditQuota: Q, priceIdr: 55_000, compareAtPriceIdr: 70_000 });
});
afterEach(() => vi.unstubAllGlobals());

async function addPromo(over: Partial<typeof promotions.$inferInsert> = {}) {
  const [row] = await db
    .insert(promotions)
    .values({ name: "Promo uji", kind: "percent", value: 10, perUserLimit: 1, ...over })
    .returning();
  return row;
}

const promoRow = async (id: number) => (await db.select().from(promotions).where(eq(promotions.id, id)))[0];
const redemptionOf = async (orderId: string) => (await db.select().from(promotionRedemptions).where(eq(promotionRedemptions.orderId, orderId)))[0];
const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];

async function rejection(p: Promise<unknown>): Promise<OrderError> {
  try {
    await p;
  } catch (err) {
    expect(err).toBeInstanceOf(OrderError);
    return err as OrderError;
  }
  throw new Error("expected an OrderError");
}

describe("createPlanOrder with a promotion", () => {
  it("a code (any case) discounts the order, is stored on it and goes to Poketo as the amount", async () => {
    const promo = await addPromo({ code: "Hemat10" });
    const u = await seedUser();

    const { orderId, tradeNo } = await createPlanOrder({ userId: u.id, planId: plan.id, promoCode: "  hEmAt10 " });

    expect(await orderRow(orderId)).toMatchObject({ promotionId: promo.id, listPriceIdr: 55_000, discountIdr: 5_500, amountIdr: 49_500 });
    expect(fake.invoices.get(tradeNo)?.amount).toBe(49_500);
    expect(await redemptionOf(orderId)).toMatchObject({ promotionId: promo.id, userId: u.id, status: "reserved" });
    expect((await promoRow(promo.id)).redeemedCount).toBe(1);
  });

  it("an automatic discount (no code) applies on its own, to the flat price rather than the strike-through price", async () => {
    await addPromo({ kind: "fixed", value: 5_000 });
    const u = await seedUser();
    const { orderId } = await createPlanOrder({ userId: u.id, planId: plan.id });
    expect(await orderRow(orderId)).toMatchObject({ listPriceIdr: 55_000, discountIdr: 5_000, amountIdr: 50_000 });
  });

  it("automatic discount plus a code: only the better one is used and only it is reserved", async () => {
    const auto = await addPromo({ name: "Otomatis", kind: "fixed", value: 3_000 });
    const coded = await addPromo({ name: "Kode", code: "BESAR", kind: "fixed", value: 8_000 });
    const u = await seedUser();
    const { orderId } = await createPlanOrder({ userId: u.id, planId: plan.id, promoCode: "besar" });
    expect(await orderRow(orderId)).toMatchObject({ promotionId: coded.id, discountIdr: 8_000, amountIdr: 47_000 });
    expect((await promoRow(auto.id)).redeemedCount).toBe(0);
    expect((await promoRow(coded.id)).redeemedCount).toBe(1);

    // The other way round: a weak code loses against the automatic discount, and costs no quota.
    await addPromo({ name: "Lemah", code: "KECIL", kind: "fixed", value: 1_000 });
    const u2 = await seedUser();
    const second = await createPlanOrder({ userId: u2.id, planId: plan.id, promoCode: "KECIL" });
    expect(await orderRow(second.orderId)).toMatchObject({ promotionId: auto.id, discountIdr: 3_000 });
  });

  it("without any promotion the order is the flat price with no promotion id", async () => {
    const u = await seedUser();
    const { orderId } = await createPlanOrder({ userId: u.id, planId: plan.id });
    expect(await orderRow(orderId)).toMatchObject({ promotionId: null, listPriceIdr: 55_000, discountIdr: 0, amountIdr: 55_000 });
    expect(await db.select().from(promotionRedemptions)).toHaveLength(0);
  });

  it("rejects with a typed reason and leaves no order, reservation or quota behind", async () => {
    const other = await seedPlan({ creditQuota: Q, priceIdr: 40_000 });
    await addPromo({ code: "LAMA", endsAt: new Date(Date.now() - HOUR) });
    await addPromo({ code: "NANTI", startsAt: new Date(Date.now() + HOUR) });
    const full = await addPromo({ code: "HABIS", maxRedemptions: 1, redeemedCount: 1 });
    await addPromo({ code: "KHUSUS", planIds: [other.id] });
    await addPromo({ code: "OFF", enabled: false });

    const cases: [string, string, string][] = [
      ["TIDAKADA", "PROMO_INVALID", "Kode promo tidak dikenali."],
      ["LAMA", "PROMO_EXPIRED", "Kode promo sudah kedaluwarsa."],
      ["OFF", "PROMO_EXPIRED", "Kode promo sudah kedaluwarsa."],
      ["NANTI", "PROMO_NOT_STARTED", "Promo ini belum dimulai."],
      ["HABIS", "PROMO_EXHAUSTED", "Kuota promo sudah habis."],
      ["KHUSUS", "PROMO_NOT_APPLICABLE", "Kode promo tidak berlaku untuk paket ini."],
      ["bad code!", "PROMO_INVALID", "Kode promo tidak dikenali."],
    ];
    for (const [code, expected, message] of cases) {
      const u = await seedUser();
      const err = await rejection(createPlanOrder({ userId: u.id, planId: plan.id, promoCode: code }));
      expect([code, err.code, err.message]).toEqual([code, expected, message]);
    }
    expect(await db.select().from(orders)).toHaveLength(0);
    expect(await readPool()).toMatchObject({ reservedQuota: 0 });
    expect((await promoRow(full.id)).redeemedCount).toBe(1);
  });

  it("per-user limit counts pending orders: the second use is refused until the first order closes", async () => {
    await addPromo({ code: "SEKALI", perUserLimit: 1 });
    const u = await seedUser();
    const first = await createPlanOrder({ userId: u.id, planId: plan.id, promoCode: "SEKALI" });

    const err = await rejection(createPlanOrder({ userId: u.id, planId: plan.id, promoCode: "SEKALI" }));
    expect(err).toMatchObject({ code: "PROMO_ALREADY_USED", message: "Kode promo ini sudah Anda pakai." });

    await expireOrder(first.orderId);
    await expect(createPlanOrder({ userId: u.id, planId: plan.id, promoCode: "SEKALI" })).resolves.toBeDefined();
  });

  it("an automatic discount the buyer already used is skipped silently instead of failing the order", async () => {
    await addPromo({ kind: "fixed", value: 5_000, perUserLimit: 1 });
    const u = await seedUser();
    await createPlanOrder({ userId: u.id, planId: plan.id });
    const second = await createPlanOrder({ userId: u.id, planId: plan.id });
    expect(await orderRow(second.orderId)).toMatchObject({ promotionId: null, discountIdr: 0, amountIdr: 55_000 });
  });

  it("(F06) 50 parallel orders on a quota of 10: exactly 10 succeed, redeemed_count is 10", async () => {
    const promo = await addPromo({ code: "RAME", maxRedemptions: 10, perUserLimit: 1 });
    const users = await Promise.all(Array.from({ length: 50 }, () => seedUser()));

    const results = await Promise.allSettled(users.map((u) => createPlanOrder({ userId: u.id, planId: plan.id, promoCode: "RAME" })));

    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    expect(failed).toHaveLength(40);
    for (const f of failed) expect(f.reason).toMatchObject({ code: "PROMO_EXHAUSTED" });

    expect((await promoRow(promo.id)).redeemedCount).toBe(10);
    expect(await db.select().from(promotionRedemptions)).toHaveLength(10);
    const all = await db.select().from(orders);
    expect(all).toHaveLength(10); // rejected attempts rolled back entirely
    expect(all.every((o) => o.promotionId === promo.id && o.amountIdr === 49_500)).toBe(true);
    expect((await readPool()).reservedQuota).toBe(10 * Q);
  }, 60_000);
});

describe("redemption lifecycle", () => {
  async function coded(max = 5, existing?: typeof promotions.$inferSelect) {
    const promo = existing ?? (await addPromo({ code: "SIKLUS", maxRedemptions: max }));
    const u = await seedUser();
    const { orderId } = await createPlanOrder({ userId: u.id, planId: plan.id, promoCode: "SIKLUS" });
    return { promo, u, orderId };
  }

  it("expiry gives the quota unit back and is idempotent", async () => {
    const { promo, orderId } = await coded();
    expect((await promoRow(promo.id)).redeemedCount).toBe(1);

    await expireOrder(orderId);
    await expireOrder(orderId);

    expect((await promoRow(promo.id)).redeemedCount).toBe(0);
    expect(await redemptionOf(orderId)).toMatchObject({ status: "released" });
  });

  it("cancel gives it back as well; a failed invoice creation too", async () => {
    const { promo, orderId } = await coded();
    await cancelOrder(orderId);
    expect((await promoRow(promo.id)).redeemedCount).toBe(0);

    fake.state.failCreate = true;
    const u = await seedUser();
    await rejection(createPlanOrder({ userId: u.id, planId: plan.id, promoCode: "SIKLUS" }));
    expect((await promoRow(promo.id)).redeemedCount).toBe(0);
    const rows = await db.select().from(promotionRedemptions);
    expect(rows.map((r) => r.status)).toEqual(["released", "released"]);
  });

  it("the last unit freed by an expiry can be taken by someone else", async () => {
    const { orderId } = await coded(1);
    const u2 = await seedUser();
    expect(await rejection(createPlanOrder({ userId: u2.id, planId: plan.id, promoCode: "SIKLUS" }))).toMatchObject({ code: "PROMO_EXHAUSTED" });
    await expireOrder(orderId);
    await expect(createPlanOrder({ userId: u2.id, planId: plan.id, promoCode: "SIKLUS" })).resolves.toBeDefined();
  });

  it("payment turns reserved into used and keeps the count", async () => {
    const { promo, orderId } = await coded();
    expect(await settleOrderPaid(orderId)).toBe("settled");
    expect(await redemptionOf(orderId)).toMatchObject({ status: "used" });
    expect((await promoRow(promo.id)).redeemedCount).toBe(1);
    expect(await settleOrderPaid(orderId)).toBe("noop");
    expect((await promoRow(promo.id)).redeemedCount).toBe(1);
  });

  it("a late payment after expiry still marks the redemption used and takes the unit again", async () => {
    const { promo, orderId } = await coded();
    await expireOrder(orderId);
    expect((await promoRow(promo.id)).redeemedCount).toBe(0);

    expect(await settleOrderPaid(orderId)).toBe("late_settled");

    expect(await redemptionOf(orderId)).toMatchObject({ status: "used" });
    expect((await promoRow(promo.id)).redeemedCount).toBe(1);
    expect(await orderRow(orderId)).toMatchObject({ status: "paid", discountIdr: 5_500 });
  });

  it("the sweeper's expiry releases the unit; its paid path marks it used", async () => {
    const a = await coded();
    const b = await coded(5, a.promo);
    for (const o of [a, b]) await db.update(orders).set({ expiresAt: new Date(Date.now() - 20 * 60_000) }).where(eq(orders.id, o.orderId));
    const tradeNo = (await orderRow(b.orderId)).tradeNo;
    fake.invoices.get(tradeNo)!.status = "paid";

    expect(await sweepPendingOrders()).toEqual({ paid: 1, expired: 1, skipped: 0 });

    expect(await redemptionOf(a.orderId)).toMatchObject({ status: "released" });
    expect(await redemptionOf(b.orderId)).toMatchObject({ status: "used" });
    expect((await promoRow(a.promo.id)).redeemedCount).toBe(1); // a released, b used
  });
});

describe("quotePlans (what the plans page and 'Terapkan' show)", () => {
  it("shows the automatic discount per plan and the reason a code is refused for another plan", async () => {
    const other = await seedPlan({ creditQuota: Q, priceIdr: 40_000 });
    await addPromo({ kind: "fixed", value: 5_000, planIds: [plan.id] });
    await addPromo({ code: "KHUSUS", planIds: [other.id] });
    const u = await seedUser();

    const q = await quotePlans(u.id, [plan, other], "khusus");

    expect(q.get(plan.id)).toMatchObject({ codeRejection: "PROMO_NOT_APPLICABLE", choice: { discountIdr: 5_000, amountIdr: 50_000 } });
    expect(q.get(other.id)).toMatchObject({ codeRejection: null, choice: { discountIdr: 4_000, amountIdr: 36_000 } });
  });

  it("throttles code lookups per user", async () => {
    const u = await seedUser();
    for (let i = 0; i < 10; i++) await quotePlans(u.id, [plan], "tebak");
    await expect(quotePlans(u.id, [plan], "tebak")).rejects.toMatchObject({ code: "PROMO_RATE_LIMITED" });
    await expect(quotePlans(u.id, [plan])).resolves.toBeDefined(); // no code, no throttle
  });
});
