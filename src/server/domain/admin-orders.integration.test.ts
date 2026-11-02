import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, fulfillments, orders } from "@/server/db/schema";
import { prepareDatabase, resetDatabase, seedPlan, seedUser } from "@/server/test/helpers";
import { getAdminOrder, listAdminOrders, listAudit, retryDeadFulfillment } from "./admin-orders";
import { AdminError, writeAudit } from "./audit";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const actor = { id: "admin-1", ip: null };

async function makeOrder(opts: { email?: string; status?: (typeof orders.$inferInsert)["status"]; fulfillment?: (typeof fulfillments.$inferInsert)["status"]; tradeNo?: string } = {}) {
  const u = await seedUser(opts.email ? { email: opts.email } : {});
  const plan = await seedPlan();
  const [o] = await db
    .insert(orders)
    .values({
      tradeNo: opts.tradeNo ?? `ADX-20261102-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      userId: u.id,
      planId: plan.id,
      planSnapshot: { name: plan.name },
      creditQuota: plan.creditQuota,
      listPriceIdr: plan.priceIdr,
      amountIdr: plan.priceIdr,
      status: opts.status ?? "paid",
      expiresAt: new Date(),
    })
    .returning();
  if (opts.fulfillment) {
    await db.insert(fulfillments).values({ orderId: o.id, status: opts.fulfillment, attempts: 10, lastError: "console down", nextAttemptAt: new Date(Date.now() + 3_600_000) });
  }
  return o;
}

describe("listAdminOrders", () => {
  it("filters by status and fulfillment, searches trade_no and email, and paginates", async () => {
    const a = await makeOrder({ email: "alice@example.com", tradeNo: "ADX-20261102-AAAAAAAA", fulfillment: "succeeded" });
    await makeOrder({ email: "bob@example.com", fulfillment: "dead" });
    await makeOrder({ email: "carol@example.com", status: "pending" });

    expect((await listAdminOrders({}, 1, 10)).total).toBe(3);
    expect((await listAdminOrders({ status: "pending" }, 1, 10)).rows.map((r) => r.email)).toEqual(["carol@example.com"]);
    expect((await listAdminOrders({ fulfillment: "dead" }, 1, 10)).rows.map((r) => r.email)).toEqual(["bob@example.com"]);
    expect((await listAdminOrders({ q: "aaaaaaaa" }, 1, 10)).rows.map((r) => r.id)).toEqual([a.id]);
    expect((await listAdminOrders({ q: "BOB@" }, 1, 10)).rows).toHaveLength(1);
    expect((await listAdminOrders({ status: "nonsense" }, 1, 10)).total).toBe(3);
    expect((await listAdminOrders({}, 2, 2)).rows).toHaveLength(1);
    expect((await listAdminOrders({}, 1, 2)).total).toBe(3);
  });

  it("treats % and _ in the search as plain characters", async () => {
    await makeOrder({ email: "alice@example.com" });
    expect((await listAdminOrders({ q: "%" }, 1, 10)).total).toBe(0);
    expect((await listAdminOrders({ q: "a_ice" }, 1, 10)).total).toBe(0);
  });
});

describe("getAdminOrder", () => {
  it("returns the order with buyer and fulfillment, null for unknown or malformed ids", async () => {
    const o = await makeOrder({ email: "alice@example.com", fulfillment: "dead" });
    const got = await getAdminOrder(o.id);
    expect(got).toMatchObject({ email: "alice@example.com", fulfillment: { status: "dead", lastError: "console down" }, grant: null });
    expect(await getAdminOrder("00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getAdminOrder("not-a-uuid")).toBeNull();
  });
});

describe("retryDeadFulfillment", () => {
  it("requeues a dead fulfillment with a fresh budget and audits it", async () => {
    const o = await makeOrder({ fulfillment: "dead" });

    await retryDeadFulfillment(actor, o.id);

    const [f] = await db.select().from(fulfillments).where(eq(fulfillments.orderId, o.id));
    expect(f).toMatchObject({ status: "queued", attempts: 0 });
    expect(f.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
    const [audit] = await db.select().from(adminAuditLog);
    expect(audit).toMatchObject({ action: "fulfillment.retry", target: `order:${o.id}`, actorId: "admin-1", before: { status: "dead", attempts: 10, lastError: "console down" } });
  });

  it.each(["queued", "retrying", "succeeded"] as const)("refuses a %s fulfillment and changes nothing", async (status) => {
    const o = await makeOrder({ fulfillment: status });
    await expect(retryDeadFulfillment(actor, o.id)).rejects.toBeInstanceOf(AdminError);
    const [f] = await db.select().from(fulfillments).where(eq(fulfillments.orderId, o.id));
    expect(f).toMatchObject({ status, attempts: 10 });
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("refuses an order without a fulfillment and a malformed id", async () => {
    const o = await makeOrder({ status: "pending" });
    await expect(retryDeadFulfillment(actor, o.id)).rejects.toBeInstanceOf(AdminError);
    await expect(retryDeadFulfillment(actor, "nope")).rejects.toBeInstanceOf(AdminError);
  });
});

describe("listAudit", () => {
  it("filters by action prefix and by actor id or email, newest first", async () => {
    const admin = await seedUser({ email: "boss@example.com" });
    await db.transaction(async (tx) => {
      await writeAudit(tx, { actor: { id: admin.id, ip: null }, action: "plan.update", target: "plan:1" });
      await writeAudit(tx, { actor: { id: admin.id, ip: null }, action: "pool.adjust", target: "credit_pool:1" });
      await writeAudit(tx, { actor: { id: "system:worker", ip: null }, action: "fulfillment.dead", target: "order:x" });
    });

    const all = await listAudit({}, 1, 10);
    expect(all.total).toBe(3);
    expect(all.rows.map((r) => r.log.action)).toEqual(["fulfillment.dead", "pool.adjust", "plan.update"]);
    expect((await listAudit({ action: "plan" }, 1, 10)).rows.map((r) => r.log.action)).toEqual(["plan.update"]);
    expect((await listAudit({ actor: "boss@" }, 1, 10)).total).toBe(2);
    expect((await listAudit({ actor: admin.id }, 1, 10)).total).toBe(2);
    expect((await listAudit({ actor: "system:worker" }, 1, 10)).rows[0].email).toBeNull();
    expect((await listAudit({ action: "%" }, 1, 10)).total).toBe(0);
    expect((await listAudit({}, 2, 2)).rows).toHaveLength(1);
  });
});
