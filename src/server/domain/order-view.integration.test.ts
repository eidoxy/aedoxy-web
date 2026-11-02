import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { describeOrder } from "@/lib/order-status";
import { db, pool as pgPool } from "@/server/db/client";
import { subscriptionGrants } from "@/server/db/schema";
import { getAdminOrder, listAdminOrders } from "./admin-orders";
import { processFulfillments } from "./fulfillment";
import { getOrderForUser, getPendingOrderId, listOrdersForUser } from "./order-view";
import { createPlanOrder, settleOrderPaid } from "./orders";
import { installFakeServers, prepareDatabase, resetDatabase, seedPlan, seedPool, seedUser } from "@/server/test/helpers";

const Q = 1_000_000;

let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
});
afterEach(() => vi.unstubAllGlobals());

describe("order labels with one active plan", () => {
  it("only the newest of A -> B -> C is labelled active, in the user, admin and detail views", async () => {
    const plan = await seedPlan({ creditQuota: Q });
    await seedPool(10 * Q);
    const u = await seedUser();

    const buyAndPay = async (replaced: { id: number; remaining: number }[] = []) => {
      const { orderId, tradeNo } = await createPlanOrder({ userId: u.id, planId: plan.id, replaceConfirmed: true });
      fake.state.replacedBy[tradeNo] = replaced;
      await settleOrderPaid(orderId);
      expect(await processFulfillments()).toMatchObject({ succeeded: 1 });
      return orderId;
    };

    const a = await buyAndPay();
    expect((await listOrdersForUser(u.id)).map((r) => describeOrder(r).label)).toEqual(["Paket aktif"]);

    const [grantA] = await db.select().from(subscriptionGrants).where(eq(subscriptionGrants.orderId, a));
    const b = await buyAndPay([{ id: grantA.newapiUserSubscriptionId, remaining: 400_000 }]);
    const [grantB] = await db.select().from(subscriptionGrants).where(eq(subscriptionGrants.orderId, b));
    // C replaces B, which had nothing left: the early reconcile alone must still read as "replaced".
    const c = await buyAndPay([{ id: grantB.newapiUserSubscriptionId, remaining: 0 }]);

    const rows = await listOrdersForUser(u.id);
    const byId = new Map(rows.map((r) => [r.id, describeOrder(r).label]));
    expect(byId.get(a)).toBe("Digantikan paket baru");
    expect(byId.get(b)).toBe("Digantikan paket baru");
    expect(byId.get(c)).toBe("Paket aktif");
    expect(rows.filter((r) => describeOrder(r).label === "Paket aktif")).toHaveLength(1);

    expect(describeOrder((await getOrderForUser(a, u.id))!).label).toBe("Digantikan paket baru");
    expect(describeOrder((await getOrderForUser(c, u.id))!).label).toBe("Paket aktif");

    const admin = await listAdminOrders({}, 1, 10);
    expect(admin.rows.filter((r) => describeOrder(r).label === "Paket aktif").map((r) => r.id)).toEqual([c]);
    const detail = (await getAdminOrder(b))!;
    expect(describeOrder({ status: detail.order.status, fulfillment: detail.fulfillment?.status ?? null, grantPhase: detail.grantPhase }).label).toBe("Digantikan paket baru");
  });

  it("labels a succeeded order whose grant ran out as ended", async () => {
    const plan = await seedPlan({ creditQuota: Q });
    await seedPool(10 * Q);
    const u = await seedUser();
    const { orderId } = await createPlanOrder({ userId: u.id, planId: plan.id });
    await settleOrderPaid(orderId);
    await processFulfillments();
    await db.update(subscriptionGrants).set({ endsAt: new Date(Date.now() - 1000) }).where(eq(subscriptionGrants.orderId, orderId));

    expect(describeOrder((await getOrderForUser(orderId, u.id))!)).toMatchObject({ label: "Berakhir", final: true });
  });
});

describe("getPendingOrderId", () => {
  it("returns the unpaid order of that user only", async () => {
    const plan = await seedPlan({ creditQuota: Q });
    await seedPool(10 * Q);
    const [me, other] = [await seedUser(), await seedUser()];
    expect(await getPendingOrderId(me.id)).toBeNull();
    const { orderId } = await createPlanOrder({ userId: me.id, planId: plan.id });
    expect(await getPendingOrderId(me.id)).toBe(orderId);
    expect(await getPendingOrderId(other.id)).toBeNull();
  });
});
