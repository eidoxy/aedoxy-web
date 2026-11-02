import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { fulfillments } from "@/server/db/schema";
import { createPlanOrder, settleOrderPaid } from "@/server/domain/orders";
import { installFakeServers, prepareDatabase, resetDatabase, seedPlan, seedPool, seedUser } from "@/server/test/helpers";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string } } }));
vi.mock("@/server/session", () => ({ getSession: async () => session.current }));

import { GET } from "./route";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  installFakeServers();
  session.current = null;
});
afterEach(() => vi.unstubAllGlobals());

const call = (id: string) => GET(new Request("https://aedoxy.test/x"), { params: Promise.resolve({ id }) });

async function order(userId: string) {
  const plan = await seedPlan({ creditQuota: 1_000_000 });
  await seedPool(5_000_000);
  return createPlanOrder({ userId, planId: plan.id });
}

describe("GET /api/orders/[id]/status", () => {
  it("answers 401 without a session", async () => {
    expect((await call("00000000-0000-4000-8000-000000000000")).status).toBe(401);
  });

  it("returns status and fulfillment to the owner, with no-store", async () => {
    const owner = await seedUser();
    const { orderId } = await order(owner.id);
    session.current = { user: { id: owner.id } };

    let res = await call(orderId);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ status: "pending", fulfillment: null, paidAt: null });

    await settleOrderPaid(orderId);
    await db.update(fulfillments).set({ status: "succeeded" }).where(eq(fulfillments.orderId, orderId));
    res = await call(orderId);
    expect(await res.json()).toMatchObject({ status: "paid", fulfillment: "succeeded", grantPhase: "active", paidAt: expect.any(String) });
  });

  it("answers 404 for another user's order and for a malformed id", async () => {
    const owner = await seedUser();
    const other = await seedUser();
    const { orderId } = await order(owner.id);
    session.current = { user: { id: other.id } };

    expect((await call(orderId)).status).toBe(404);
    expect((await call("not-a-uuid")).status).toBe(404);
  });
});
