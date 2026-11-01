import { count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, creditPool, fulfillments, orders, plans, poolLedger, subscriptionGrants } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, readPool, resetDatabase, seedPlan, seedPool, seedUser } from "@/server/test/helpers";
import { backoffMs, claimDue, MAX_ATTEMPTS, processFulfillments } from "./fulfillment";
import { createPlanOrder, settleOrderPaid } from "./orders";
import { sweepPendingOrders } from "./order-sweeper";
import * as pool from "./pool";
import { checkPoolInvariant } from "./pool-invariant";
import { reconcileExpiredGrants } from "./reconcile";

const Q = 10_000_000;
const DAY = 86_400_000;

let fake: ReturnType<typeof installFakeServers>;
let plan: Awaited<ReturnType<typeof seedPlan>>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  plan = await seedPlan({ creditQuota: Q, newapiPlanId: 7 });
  // Opening balance goes through the ledger so the invariant check can hold.
  await seedPool(0);
  await db.transaction((tx) => pool.adjust(tx, { delta: 100 * Q, actorId: "test", note: "opening" }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function paidOrder(user?: Awaited<ReturnType<typeof seedUser>>) {
  const u = user ?? (await seedUser());
  const { orderId, tradeNo } = await createPlanOrder({ userId: u.id, planId: plan.id });
  await settleOrderPaid(orderId);
  return { u, orderId, tradeNo };
}

const fulfillmentOf = async (orderId: string) => (await db.select().from(fulfillments).where(eq(fulfillments.orderId, orderId)))[0];
const ledgerOf = async (type: (typeof poolLedger.$inferSelect)["type"]) => db.select().from(poolLedger).where(eq(poolLedger.type, type));
const requeue = (orderId: string) => db.update(fulfillments).set({ status: "queued", nextAttemptAt: new Date(0) }).where(eq(fulfillments.orderId, orderId));

describe("fulfillment outbox", () => {
  it("activates a paid order through the bridge and stores the grant", async () => {
    const { u, orderId, tradeNo } = await paidOrder();

    expect(await processFulfillments()).toEqual({ claimed: 1, succeeded: 1, retried: 0, dead: 0 });

    expect(fake.state.fulfillBodies).toEqual([{ trade_no: tradeNo, user_id: u.newapiUserId, plan_id: 7, money_idr: 55_000, payment_method: "QRIS" }]);
    const f = await fulfillmentOf(orderId);
    expect(f).toMatchObject({ status: "succeeded", attempts: 1, lastError: null });
    const [grant] = await db.select().from(subscriptionGrants);
    expect(grant).toMatchObject({ orderId, newapiUserId: u.newapiUserId, newapiUserSubscriptionId: 500, creditQuota: Q, returnedQuota: 0, reconciledAt: null });
    expect(f.newapiRef).toMatchObject({ user_subscription_id: 500 });
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order.status).toBe("paid");
  });

  it("retries with backoff 10s, 30s, 2m, 10m, 1h and then succeeds", async () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(backoffMs)).toEqual([10_000, 30_000, 120_000, 600_000, 3_600_000, 3_600_000, 3_600_000]);
    const { orderId } = await paidOrder();
    const t0 = new Date();
    fake.state.failFulfill = 1;

    expect(await processFulfillments(t0)).toMatchObject({ claimed: 1, retried: 1 });

    const f = await fulfillmentOf(orderId);
    expect(f).toMatchObject({ status: "retrying", attempts: 1, lastError: "Bridge returned HTTP 500" });
    expect(f.nextAttemptAt.getTime()).toBe(t0.getTime() + 10_000);
    expect(await processFulfillments(new Date(t0.getTime() + 9_000))).toMatchObject({ claimed: 0 }); // not due yet
    expect(await processFulfillments(new Date(t0.getTime() + 11_000))).toMatchObject({ claimed: 1, succeeded: 1 });
    expect((await fulfillmentOf(orderId)).attempts).toBe(2);
  });

  it("goes dead after 10 failed attempts, writes an audit row and is never claimed again", async () => {
    const { orderId } = await paidOrder();
    await db.update(fulfillments).set({ attempts: MAX_ATTEMPTS - 1 }).where(eq(fulfillments.orderId, orderId));
    fake.state.failFulfill = 5;

    expect(await processFulfillments()).toMatchObject({ claimed: 1, dead: 1 });

    expect(await fulfillmentOf(orderId)).toMatchObject({ status: "dead", attempts: MAX_ATTEMPTS });
    const [audit] = await db.select().from(adminAuditLog);
    expect(audit).toMatchObject({ actorId: "system:worker", action: "fulfillment.dead", target: `order:${orderId}` });
    expect(await processFulfillments(new Date(Date.now() + 10 * DAY))).toMatchObject({ claimed: 0 });
  });

  it("running twice does not activate twice, even if the bookkeeping was lost after the bridge call", async () => {
    const { orderId } = await paidOrder();
    await processFulfillments();
    expect(await processFulfillments()).toMatchObject({ claimed: 0 });

    await requeue(orderId); // as if the success was never recorded
    expect(await processFulfillments()).toMatchObject({ claimed: 1, succeeded: 1 });

    expect(await db.select().from(subscriptionGrants)).toHaveLength(1);
    expect(fake.fulfilled.size).toBe(1);
    expect(fake.state.fulfillBodies).toHaveLength(2); // the second call was answered with already_fulfilled
    expect(await fulfillmentOf(orderId)).toMatchObject({ status: "succeeded" });
  });

  it("two concurrent claims never take the same row", async () => {
    const made = await Promise.all(Array.from({ length: 6 }, () => paidOrder()));
    expect(made).toHaveLength(6);

    const [a, b] = await Promise.all([claimDue(new Date(), 10), claimDue(new Date(), 10)]);

    const ids = [...a, ...b].map((c) => c.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(a.length + b.length).toBe(6);
  }, 30_000);

  it("two workers processing at once call the bridge exactly once per order", async () => {
    await Promise.all(Array.from({ length: 6 }, () => paidOrder()));

    await Promise.all([processFulfillments(new Date(), 10), processFulfillments(new Date(), 10)]);

    expect(fake.state.fulfillBodies).toHaveLength(6);
    expect(new Set(fake.state.fulfillBodies.map((b) => b.trade_no)).size).toBe(6);
    expect(await db.select().from(subscriptionGrants)).toHaveLength(6);
    const rows = await db.select().from(fulfillments);
    expect(rows.every((r) => r.status === "succeeded" && r.attempts === 1)).toBe(true);
  }, 30_000);

  it("returns the unused credit of a replaced subscription to the pool exactly once", async () => {
    const { u, orderId: oldOrder } = await paidOrder();
    await processFulfillments();
    const soldBefore = (await readPool()).soldQuota;

    const { orderId: newOrder, tradeNo } = await paidOrder(u);
    fake.state.replacedBy[tradeNo] = [{ id: 500, remaining: 1_250_000 }];
    await processFulfillments();

    let returns = await ledgerOf("replace_return");
    expect(returns).toHaveLength(1);
    expect(returns[0]).toMatchObject({ delta: -1_250_000, orderId: oldOrder });
    expect((await readPool()).soldQuota).toBe(soldBefore + Q - 1_250_000);
    const [old] = await db.select().from(subscriptionGrants).where(eq(subscriptionGrants.orderId, oldOrder));
    expect(old.returnedQuota).toBe(1_250_000);
    expect(old.reconciledAt).toBeInstanceOf(Date);

    await requeue(newOrder); // same bridge answer again
    await processFulfillments();

    returns = await ledgerOf("replace_return");
    expect(returns).toHaveLength(1);
    expect((await readPool()).soldQuota).toBe(soldBefore + Q - 1_250_000);
    expect((await checkPoolInvariant())?.ok).toBe(true);
  });
});

describe("expiry reconciliation", () => {
  async function fulfilledOrder() {
    const made = await paidOrder();
    await processFulfillments();
    const [grant] = await db.select().from(subscriptionGrants).where(eq(subscriptionGrants.orderId, made.orderId));
    const later = new Date(grant.endsAt.getTime() + DAY);
    const subscribe = (status: string, used: number) =>
      fake.subscriptions.set(made.u.newapiUserId!, [
        {
          subscription: {
            id: grant.newapiUserSubscriptionId,
            plan_id: 7,
            amount_total: Q,
            amount_used: used,
            end_time: Math.floor(grant.endsAt.getTime() / 1000),
            status,
          },
        },
      ]);
    return { ...made, grant, later, subscribe };
  }

  it("returns total - used once, and nothing on the second run", async () => {
    const { orderId, later, subscribe } = await fulfilledOrder();
    subscribe("expired", 4_000_000);
    const soldBefore = (await readPool()).soldQuota;

    expect(await reconcileExpiredGrants(later)).toEqual({ returned: 1, skipped: 0 });
    expect(await reconcileExpiredGrants(later)).toEqual({ returned: 0, skipped: 0 });

    const returns = await ledgerOf("expire_return");
    expect(returns).toHaveLength(1);
    expect(returns[0]).toMatchObject({ delta: -(Q - 4_000_000), orderId });
    expect((await readPool()).soldQuota).toBe(soldBefore - (Q - 4_000_000));
    const [grant] = await db.select().from(subscriptionGrants);
    expect(grant).toMatchObject({ returnedQuota: Q - 4_000_000 });
    expect(grant.reconciledAt).toBeInstanceOf(Date);
  });

  it("two workers reconciling at once return it once", async () => {
    const { later, subscribe } = await fulfilledOrder();
    subscribe("expired", 0);

    await Promise.all([reconcileExpiredGrants(later), reconcileExpiredGrants(later)]);

    expect(await ledgerOf("expire_return")).toHaveLength(1);
    expect((await readPool()).soldQuota).toBe(0);
  });

  it("waits while the console still reports the subscription as running, and before the end date", async () => {
    const { grant, later, subscribe } = await fulfilledOrder();
    subscribe("active", 0);
    fake.subscriptions.set(grant.newapiUserId, [
      { subscription: { id: grant.newapiUserSubscriptionId, plan_id: 7, amount_total: Q, amount_used: 0, end_time: Math.floor(later.getTime() / 1000) + 3600, status: "active" } },
    ]);

    expect(await reconcileExpiredGrants(later)).toEqual({ returned: 0, skipped: 1 });
    expect(await reconcileExpiredGrants(new Date())).toEqual({ returned: 0, skipped: 0 }); // not ended yet: not even looked at
    expect(await ledgerOf("expire_return")).toHaveLength(0);
  });

  it("returns nothing but still marks a fully used subscription as reconciled", async () => {
    const { later, subscribe } = await fulfilledOrder();
    subscribe("expired", Q + 5);
    expect(await reconcileExpiredGrants(later)).toEqual({ returned: 1, skipped: 0 });
    expect(await ledgerOf("expire_return")).toHaveLength(0);
    expect((await db.select().from(subscriptionGrants))[0].reconciledAt).toBeInstanceOf(Date);
  });
});

describe("order sweeper", () => {
  async function pendingOrder(expiredMinutesAgo: number) {
    const u = await seedUser();
    const { orderId, tradeNo } = await createPlanOrder({ userId: u.id, planId: plan.id });
    await db.update(orders).set({ expiresAt: new Date(Date.now() - expiredMinutesAgo * 60_000) }).where(eq(orders.id, orderId));
    return { orderId, tradeNo };
  }
  const statusOf = async (orderId: string) => (await db.select().from(orders).where(eq(orders.id, orderId)))[0].status;

  it("settles an order that Poketo shows as paid (late sell path) and queues activation", async () => {
    const { orderId, tradeNo } = await pendingOrder(20);
    fake.invoices.get(tradeNo)!.status = "paid";

    expect(await sweepPendingOrders()).toEqual({ paid: 1, expired: 0, skipped: 0 });

    expect(await statusOf(orderId)).toBe("paid");
    expect(await fulfillmentOf(orderId)).toMatchObject({ status: "queued" });
    expect(await ledgerOf("sell")).toHaveLength(1);
    expect(await readPool()).toMatchObject({ reservedQuota: 0, soldQuota: Q });
  });

  it("expires an unpaid order and gives the reservation and plan stock back", async () => {
    const { orderId } = await pendingOrder(20);

    expect(await sweepPendingOrders()).toEqual({ paid: 0, expired: 1, skipped: 0 });

    expect(await statusOf(orderId)).toBe("expired");
    expect(await readPool()).toMatchObject({ reservedQuota: 0, soldQuota: 0 });
    expect((await db.select().from(plans).where(eq(plans.id, plan.id)))[0].soldCount).toBe(0);
    expect(await sweepPendingOrders()).toEqual({ paid: 0, expired: 0, skipped: 0 });
  });

  it("leaves orders alone until 10 minutes after expires_at", async () => {
    const { orderId } = await pendingOrder(5);
    expect(await sweepPendingOrders()).toEqual({ paid: 0, expired: 0, skipped: 0 });
    expect(await statusOf(orderId)).toBe("pending");
  });

  it("keeps the order pending when Poketo is unavailable, and refuses a mismatching amount", async () => {
    const a = await pendingOrder(20);
    const b = await pendingOrder(20);
    fake.invoices.get(b.tradeNo)!.amount = 1;
    const realFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      if (String(input).includes(a.tradeNo)) return new Response("{}", { status: 503 });
      return realFetch(input, init);
    });

    const result = await sweepPendingOrders();

    expect(result).toEqual({ paid: 0, expired: 0, skipped: 2 });
    expect(await statusOf(a.orderId)).toBe("pending");
    expect(await statusOf(b.orderId)).toBe("pending");
  }, 15_000);
});

describe("pool invariant", () => {
  it("holds across reserve, sell, release and returns", async () => {
    await paidOrder();
    await processFulfillments();
    const u = await seedUser();
    const { orderId } = await createPlanOrder({ userId: u.id, planId: plan.id });
    expect((await checkPoolInvariant())?.ok).toBe(true);
    await db.update(orders).set({ expiresAt: new Date(Date.now() - 20 * 60_000) }).where(eq(orders.id, orderId));
    await sweepPendingOrders();
    expect(await checkPoolInvariant()).toMatchObject({ ok: true, pool: { total: 100 * Q, reserved: 0, sold: Q } });
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("reports a mismatch with an audit row and does not repair it", async () => {
    await db.update(creditPool).set({ soldQuota: 7 }).where(eq(creditPool.id, 1));

    const result = await checkPoolInvariant();

    expect(result).toMatchObject({ ok: false, pool: { sold: 7 }, ledger: { sold: 0 } });
    const [audit] = await db.select().from(adminAuditLog);
    expect(audit).toMatchObject({ actorId: "system:worker", action: "pool.invariant_mismatch" });
    expect((await readPool()).soldQuota).toBe(7);
    const [{ n }] = await db.select({ n: count() }).from(poolLedger);
    expect(n).toBe(1); // only the opening balance
  });
});
