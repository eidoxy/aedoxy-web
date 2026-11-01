import { count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/webhooks/poketo/route";
import { env } from "@/env";
import { db, pool as pgPool } from "@/server/db/client";
import { creditPool, fulfillments, orders, plans, poolLedger, webhookEvents } from "@/server/db/schema";
import { createPlanOrder, expireOrder } from "@/server/domain/orders";
import {
  installFakeServers,
  paidBody,
  prepareDatabase,
  readPool,
  resetDatabase,
  seedPlan,
  seedPool,
  seedUser,
  webhookRequest,
} from "@/server/test/helpers";

const Q = 10_000_000;
const AMOUNT = 55_000;

let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function pendingOrder(poolTotal = 2 * Q) {
  const plan = await seedPlan({ creditQuota: Q, priceIdr: AMOUNT });
  await seedPool(poolTotal);
  const u = await seedUser();
  const { orderId, tradeNo } = await createPlanOrder({ userId: u.id, planId: plan.id });
  return { plan, orderId, tradeNo };
}

const setInvoice = (tradeNo: string, patch: { status?: string; amount?: number }) =>
  Object.assign(fake.invoices.get(tradeNo)!, patch);
const orderRow = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0];
const countOf = async (table: typeof fulfillments | typeof webhookEvents | typeof poolLedger) =>
  (await db.select({ n: count() }).from(table))[0].n;
const ledgerOf = async (type: (typeof poolLedger.$inferSelect)["type"]) =>
  (await db.select().from(poolLedger).where(eq(poolLedger.type, type))).length;

describe("POST /api/webhooks/poketo", () => {
  it("(b) 10 parallel paid events for one order: one fulfillment, sold once, one sell ledger row", async () => {
    const { orderId, tradeNo } = await pendingOrder();
    setInvoice(tradeNo, { status: "paid" });

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => POST(webhookRequest(paidBody(tradeNo)))),
    );

    expect(responses.map((r) => r.status)).toEqual(Array(10).fill(200));
    expect(await countOf(fulfillments)).toBe(1);
    expect(await ledgerOf("sell")).toBe(1);
    expect(await readPool()).toMatchObject({ reservedQuota: 0, soldQuota: Q });
    expect((await orderRow(orderId)).status).toBe("paid");
    expect((await orderRow(orderId)).paidAt).not.toBeNull();
    const [fulfillment] = await db.select().from(fulfillments);
    expect(fulfillment).toMatchObject({ orderId, status: "queued" });
  });

  it("(c) a late payment on an expired order still activates the plan and may make the pool negative", async () => {
    const { orderId, tradeNo, plan } = await pendingOrder(Q);
    await expireOrder(orderId);
    await db.update(creditPool).set({ totalQuota: 0 }); // stock was withdrawn after the order expired
    setInvoice(tradeNo, { status: "paid" });

    const res = await POST(webhookRequest(paidBody(tradeNo)));

    expect(res.status).toBe(200);
    expect((await orderRow(orderId)).status).toBe("paid");
    expect(await countOf(fulfillments)).toBe(1);
    expect(await ledgerOf("late_sell")).toBe(1);
    const pool = await readPool();
    expect(pool).toMatchObject({ reservedQuota: 0, soldQuota: Q });
    expect(pool.totalQuota - pool.reservedQuota - pool.soldQuota).toBeLessThan(0);
    const [row] = await db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row.soldCount).toBe(1);
    expect(console.warn).toHaveBeenCalled();
  });

  it("(e) refuses to credit when Poketo reports a different amount", async () => {
    const { orderId, tradeNo } = await pendingOrder();
    setInvoice(tradeNo, { status: "paid", amount: AMOUNT - 1 });

    const res = await POST(webhookRequest(paidBody(tradeNo)));

    expect(res.status).toBe(200);
    expect((await orderRow(orderId)).status).toBe("pending");
    expect(await countOf(fulfillments)).toBe(0);
    expect(await ledgerOf("sell")).toBe(0);
    expect(await readPool()).toMatchObject({ reservedQuota: Q, soldQuota: 0 });
    expect((await db.select().from(webhookEvents))[0].result).toBe("mismatch");
  });

  it("(e) trusts the Poketo API over the webhook claim", async () => {
    const { orderId, tradeNo } = await pendingOrder();
    // Body says paid, API says expired: the order must expire, not get credited.
    setInvoice(tradeNo, { status: "expired" });

    expect((await POST(webhookRequest(paidBody(tradeNo)))).status).toBe(200);

    expect((await orderRow(orderId)).status).toBe("expired");
    expect(await countOf(fulfillments)).toBe(0);
    expect((await readPool()).reservedQuota).toBe(0);
  });

  it("(f) rejects a bad, altered or stale signature with 401 and changes nothing", async () => {
    const { orderId, tradeNo } = await pendingOrder();
    setInvoice(tradeNo, { status: "paid" });
    const body = paidBody(tradeNo);
    const good = webhookRequest(body);
    const sig = good.headers.get("poketo-signature")!;

    const wrongSecret = webhookRequest(body, { secret: "whsec_other" });
    const altered = webhookRequest(body.replace("ADX", "ADY"), { signature: sig });
    const stale = webhookRequest(body, { t: Math.floor(Date.now() / 1000) - 600 });
    const missing = webhookRequest(body, { signature: "" });

    for (const req of [wrongSecret, altered, stale, missing]) expect((await POST(req)).status).toBe(401);

    expect(await countOf(webhookEvents)).toBe(0);
    expect((await orderRow(orderId)).status).toBe("pending");
    expect(await readPool()).toMatchObject({ reservedQuota: Q, soldQuota: 0 });
    expect(await countOf(fulfillments)).toBe(0);
  });

  it("(g) answers 401 to everything while the webhook secret is empty", async () => {
    const { orderId, tradeNo } = await pendingOrder();
    setInvoice(tradeNo, { status: "paid" });
    const original = env.POKETO_WEBHOOK_SECRET;
    try {
      env.POKETO_WEBHOOK_SECRET = undefined;
      expect((await POST(webhookRequest(paidBody(tradeNo)))).status).toBe(401);
      expect((await POST(webhookRequest(paidBody(tradeNo), { secret: "" }))).status).toBe(401);
      expect((await POST(webhookRequest("{}", { event: "ping" }))).status).toBe(401);
    } finally {
      env.POKETO_WEBHOOK_SECRET = original;
    }
    expect((await orderRow(orderId)).status).toBe("pending");
    expect(await countOf(webhookEvents)).toBe(0);
  });

  it("(h) processes a repeated event id once", async () => {
    const { orderId, tradeNo } = await pendingOrder();
    setInvoice(tradeNo, { status: "paid" });
    const eventId = "evt_same";

    const first = await POST(webhookRequest(paidBody(tradeNo), { eventId }));
    const callsAfterFirst = fake.state.calls.filter((c) => c.startsWith("GET poketo.test")).length;
    const second = await POST(webhookRequest(paidBody(tradeNo), { eventId }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ result: "duplicate" });
    expect(fake.state.calls.filter((c) => c.startsWith("GET poketo.test")).length).toBe(callsAfterFirst);
    expect(await countOf(webhookEvents)).toBe(1);
    expect((await db.select().from(webhookEvents))[0].processedAt).not.toBeNull();
    expect(await ledgerOf("sell")).toBe(1);
    expect((await orderRow(orderId)).status).toBe("paid");
  });

  it("answers ping with 200 and nothing else, but only when signed", async () => {
    expect((await POST(webhookRequest('{"type":"ping"}', { event: "ping" }))).status).toBe(200);
    expect((await POST(webhookRequest('{"type":"ping"}', { event: "ping", secret: "nope" }))).status).toBe(401);
    expect(await countOf(webhookEvents)).toBe(0);
  });

  it("finds the order from any known payload shape, including metadata.order_id", async () => {
    const { orderId, tradeNo } = await pendingOrder();
    setInvoice(tradeNo, { status: "paid" });
    const body = JSON.stringify({ type: "invoice.paid", data: { metadata: { order_id: orderId } } });

    expect((await POST(webhookRequest(body))).status).toBe(200);
    expect((await orderRow(orderId)).status).toBe("paid");
  });

  it("answers 200 for an unknown order and for unknown event types", async () => {
    expect((await POST(webhookRequest(paidBody("ADX-NOPE")))).status).toBe(200);
    expect((await POST(webhookRequest("{}", { event: "account.updated" }))).status).toBe(200);
    expect((await db.select().from(webhookEvents)).map((e) => e.result).sort()).toEqual(["ignored", "order_not_found"]);
  });

  it("expires and cancels pending orders, and flags refunds without touching the pool", async () => {
    const a = await pendingOrder(5 * Q);
    setInvoice(a.tradeNo, { status: "expired" });
    await POST(webhookRequest(paidBody(a.tradeNo), { event: "invoice.expired" }));
    expect((await orderRow(a.orderId)).status).toBe("expired");
    expect((await readPool()).reservedQuota).toBe(0);

    const u = await seedUser();
    const b = await createPlanOrder({ userId: u.id, planId: a.plan.id });
    setInvoice(b.tradeNo, { status: "cancelled" });
    await POST(webhookRequest(paidBody(b.tradeNo), { event: "invoice.cancelled" }));
    expect((await orderRow(b.orderId)).status).toBe("cancelled");

    const c = await createPlanOrder({ userId: (await seedUser()).id, planId: a.plan.id });
    setInvoice(c.tradeNo, { status: "paid" });
    await POST(webhookRequest(paidBody(c.tradeNo)));
    setInvoice(c.tradeNo, { status: "refunded" });
    await POST(webhookRequest(paidBody(c.tradeNo), { event: "invoice.refunded" }));
    expect((await orderRow(c.orderId)).status).toBe("refunded");
    expect(await readPool()).toMatchObject({ reservedQuota: 0, soldQuota: Q });
  });

  it("asks Poketo to retry (500) when a paid event is not yet confirmed by the API, then succeeds on retry", async () => {
    const { orderId, tradeNo } = await pendingOrder();
    const eventId = "evt_retry";

    expect((await POST(webhookRequest(paidBody(tradeNo), { eventId }))).status).toBe(500);
    expect((await db.select().from(webhookEvents))[0].processedAt).toBeNull();

    setInvoice(tradeNo, { status: "paid" });
    expect((await POST(webhookRequest(paidBody(tradeNo), { eventId }))).status).toBe(200);
    expect((await orderRow(orderId)).status).toBe("paid");
    expect(await countOf(webhookEvents)).toBe(1);
  });

  it("answers 500 when Poketo is unreachable", async () => {
    const { tradeNo } = await pendingOrder();
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    expect((await POST(webhookRequest(paidBody(tradeNo)))).status).toBe(500);
  }, 15_000);
});
