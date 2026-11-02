import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pool as pgPool } from "@/server/db/client";
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

async function seedOrders() {
  const plan = await seedPlan({ creditQuota: 1_000_000 });
  await seedPool(5_000_000);
  const owner = await seedUser();
  const other = await seedUser();
  const mine = await createPlanOrder({ userId: owner.id, planId: plan.id });
  const theirs = await createPlanOrder({ userId: other.id, planId: plan.id });
  return { owner, other, mine: mine.orderId, theirs: theirs.orderId };
}

describe("GET /api/orders", () => {
  it("answers 401 without a session", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("lists only the caller's orders in the compact shape", async () => {
    const { owner, other, mine, theirs } = await seedOrders();
    session.current = { user: { id: owner.id } };

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0]).toEqual({
      id: mine,
      createdAt: expect.any(String),
      planName: expect.any(String),
      amountIdr: expect.any(Number),
      statusLabel: "Menunggu pembayaran",
      tone: "pending",
      pending: true,
    });
    expect(JSON.stringify(body)).not.toContain(theirs);

    session.current = { user: { id: other.id } };
    expect((await (await GET()).json()).orders.map((o: { id: string }) => o.id)).toEqual([theirs]);
  });

  it("marks an order as no longer pending once it is paid", async () => {
    const { owner, mine } = await seedOrders();
    await settleOrderPaid(mine);
    session.current = { user: { id: owner.id } };

    const [row] = (await (await GET()).json()).orders;
    expect(row).toMatchObject({ id: mine, pending: false });
    expect(row.statusLabel).not.toBe("Menunggu pembayaran");
  });
});
