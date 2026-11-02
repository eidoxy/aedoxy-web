import { count, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { fulfillments, orders, plans, poolLedger } from "@/server/db/schema";
import {
  installFakeServers,
  prepareDatabase,
  readPool,
  resetDatabase,
  seedPlan,
  seedPool,
  seedUser,
} from "@/server/test/helpers";
import { createPlanOrder, expireOrder, OrderError, settleOrderPaid } from "./orders";

const Q = 10_000_000; // plan credit in quota units

let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
});
afterEach(() => vi.unstubAllGlobals());

async function rejection(promise: Promise<unknown>): Promise<OrderError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(OrderError);
    return err as OrderError;
  }
  throw new Error("expected an OrderError");
}

async function ledgerCount(type: (typeof poolLedger.$inferSelect)["type"]) {
  const rows = await db.select().from(poolLedger).where(eq(poolLedger.type, type));
  return rows.length;
}

describe("createPlanOrder", () => {
  it("(a) 40 parallel orders for a pool of 5 plans: exactly 5 succeed and the invariant holds", async () => {
    const plan = await seedPlan({ creditQuota: Q });
    await seedPool(5 * Q);
    const users = await Promise.all(Array.from({ length: 40 }, () => seedUser()));

    const results = await Promise.allSettled(users.map((u) => createPlanOrder({ userId: u.id, planId: plan.id })));

    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(ok).toHaveLength(5);
    expect(failed).toHaveLength(35);
    for (const f of failed) {
      expect(f.reason).toBeInstanceOf(OrderError);
      expect(f.reason).toMatchObject({ code: "OUT_OF_STOCK", message: "Stok paket habis." });
    }

    const pool = await readPool();
    expect(pool).toMatchObject({ totalQuota: 5 * Q, reservedQuota: 5 * Q, soldQuota: 0 });
    const pending = await db.select().from(orders).where(eq(orders.status, "pending"));
    expect(pending).toHaveLength(5);
    expect(pending.reduce((sum, o) => sum + o.creditQuota, 0)).toBe(pool.reservedQuota);
    expect((await db.select().from(orders)).length).toBe(5); // rejected attempts left nothing behind
    expect(await ledgerCount("reserve")).toBe(5);
    const [row] = await db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row.soldCount).toBe(5);
    expect(pending.every((o) => o.paymentUrl && o.poketoInvoiceId && /^ADX-\d{8}-[A-Z0-9]{8}$/.test(o.tradeNo))).toBe(true);
  }, 30_000);

  it("creates one Poketo invoice from the order and stores the payment link", async () => {
    const plan = await seedPlan({ creditQuota: Q, priceIdr: 55_000 });
    await seedPool(Q);
    const u = await seedUser();

    const result = await createPlanOrder({ userId: u.id, planId: plan.id });

    const [order] = await db.select().from(orders).where(eq(orders.id, result.orderId));
    expect(order).toMatchObject({ status: "pending", amountIdr: 55_000, listPriceIdr: 55_000, discountIdr: 0, creditQuota: Q });
    expect(order.paymentUrl).toBe(result.paymentUrl);
    expect(fake.invoices.get(order.tradeNo)).toMatchObject({ amount: 55_000, referenceId: order.tradeNo });
  });

  it("(d) expireOrder gives back the pool reservation and plan stock, and is idempotent", async () => {
    const plan = await seedPlan({ creditQuota: Q });
    await seedPool(2 * Q);
    const u = await seedUser();
    const { orderId } = await createPlanOrder({ userId: u.id, planId: plan.id });
    expect((await readPool()).reservedQuota).toBe(Q);

    expect(await expireOrder(orderId)).toBe("closed");
    expect(await expireOrder(orderId)).toBe("noop");

    expect((await readPool()).reservedQuota).toBe(0);
    const [row] = await db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row.soldCount).toBe(0);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order.status).toBe("expired");
    expect(await ledgerCount("release")).toBe(1);
  });

  it("(i) refuses a second pending order and names the first, then rate-limits the sixth attempt", async () => {
    const plan = await seedPlan({ creditQuota: Q });
    await seedPool(10 * Q);
    const u = await seedUser();
    const buy = () => createPlanOrder({ userId: u.id, planId: plan.id });

    const first = await buy();
    for (let i = 0; i < 4; i++) {
      const err = await rejection(buy());
      expect(err.code).toBe("TOO_MANY_PENDING");
      expect(err.pendingOrderId).toBe(first.orderId);
    }
    expect((await rejection(buy())).code).toBe("RATE_LIMITED");

    expect((await readPool()).reservedQuota).toBe(Q);
    const [{ n }] = await db.select({ n: count() }).from(orders);
    expect(n).toBe(1);
  });

  it("(i) parallel orders by one user cannot exceed the pending cap", async () => {
    const plan = await seedPlan({ creditQuota: Q });
    await seedPool(10 * Q);
    const u = await seedUser();
    const results = await Promise.allSettled([1, 2, 3, 4].map(() => createPlanOrder({ userId: u.id, planId: plan.id })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await readPool()).reservedQuota).toBe(Q);
  });

  it("(j) a user with an active plan needs replaceConfirmed", async () => {
    const plan = await seedPlan({ creditQuota: Q, name: "Mingguan $7", newapiPlanId: 8 });
    await seedPlan({ creditQuota: Q, name: "Bulanan $20", newapiPlanId: 3 });
    await seedPool(5 * Q);
    const u = await seedUser({ newapiUserId: 77 });
    const endTime = Math.floor(Date.now() / 1000) + 5 * 86_400;
    fake.subscriptions.set(77, [
      { subscription: { id: 5, plan_id: 3, amount_total: 1_000_000, amount_used: 250_000, end_time: endTime, status: "active" } },
    ]);

    const err = await rejection(createPlanOrder({ userId: u.id, planId: plan.id }));
    expect(err.code).toBe("REPLACE_CONFIRMATION_REQUIRED");
    expect(err.details).toEqual({ planName: "Bulanan $20", remainingQuota: 750_000, endsAt: new Date(endTime * 1000) });
    expect(await readPool()).toMatchObject({ reservedQuota: 0 });
    expect((await db.select().from(orders)).length).toBe(0);

    await expect(createPlanOrder({ userId: u.id, planId: plan.id, replaceConfirmed: true })).resolves.toMatchObject({
      tradeNo: expect.stringMatching(/^ADX-/),
    });
    expect((await readPool()).reservedQuota).toBe(Q);
  });

  it("marks the order failed and releases everything when Poketo cannot create the invoice", async () => {
    const plan = await seedPlan({ creditQuota: Q });
    await seedPool(2 * Q);
    const u = await seedUser();
    fake.state.failCreate = true;

    expect((await rejection(createPlanOrder({ userId: u.id, planId: plan.id }))).code).toBe("PAYMENT_UNAVAILABLE");

    const [order] = await db.select().from(orders);
    expect(order.status).toBe("failed");
    expect((await readPool()).reservedQuota).toBe(0);
    const [row] = await db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row.soldCount).toBe(0);
  }, 15_000);

  it("enforces the plan stock limit, per-user purchase limit, sale period and unverified users", async () => {
    await seedPool(20 * Q);
    const limited = await seedPlan({ creditQuota: Q, stockLimit: 1 });
    const [a, b] = [await seedUser(), await seedUser()];
    await createPlanOrder({ userId: a.id, planId: limited.id });
    expect((await rejection(createPlanOrder({ userId: b.id, planId: limited.id }))).code).toBe("OUT_OF_STOCK");
    expect((await readPool()).reservedQuota).toBe(Q); // the rejected attempt reserved nothing

    const once = await seedPlan({ creditQuota: Q, maxPurchasePerUser: 1 });
    const bought = await createPlanOrder({ userId: b.id, planId: once.id });
    expect((await rejection(createPlanOrder({ userId: b.id, planId: once.id }))).code).toBe("TOO_MANY_PENDING");
    await settleOrderPaid(bought.orderId); // a paid order counts toward the limit and frees the pending slot
    expect((await rejection(createPlanOrder({ userId: b.id, planId: once.id }))).code).toBe("PURCHASE_LIMIT");

    const future = await seedPlan({ creditQuota: Q, saleStartsAt: new Date(Date.now() + 3_600_000) });
    expect((await rejection(createPlanOrder({ userId: b.id, planId: future.id }))).code).toBe("OUT_OF_SALE_PERIOD");

    const unverified = await seedUser({ emailVerified: false, newapiUserId: null });
    expect((await rejection(createPlanOrder({ userId: unverified.id, planId: once.id }))).code).toBe("USER_NOT_ELIGIBLE");
  });
});

describe("pool invariants", () => {
  it("leaves no fulfillment for orders that were never paid", async () => {
    const plan = await seedPlan({ creditQuota: Q });
    await seedPool(Q);
    const u = await seedUser();
    await createPlanOrder({ userId: u.id, planId: plan.id });
    const [{ n }] = await db.select({ n: count() }).from(fulfillments);
    expect(n).toBe(0);
  });
});
