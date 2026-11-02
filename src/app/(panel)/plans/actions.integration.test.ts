import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, readPool, resetDatabase, seedPlan, seedPool, seedUser } from "@/server/test/helpers";

const current = vi.hoisted(() => ({ userId: "" }));
vi.mock("@/server/session", () => ({ requireSession: async () => ({ user: { id: current.userId } }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { buyPlan } from "./actions";

const Q = 1_000_000;
let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
});
afterEach(() => vi.unstubAllGlobals());

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

async function setup(newapiUserId = 77) {
  const plan = await seedPlan({ creditQuota: Q, name: "Mingguan $7", newapiPlanId: 8 });
  await seedPlan({ creditQuota: Q, name: "Bulanan $20", newapiPlanId: 3 });
  await seedPool(10 * Q);
  const u = await seedUser({ newapiUserId });
  current.userId = u.id;
  return { plan, u };
}

const activeSubscription = (userId: number) =>
  fake.subscriptions.set(userId, [
    { subscription: { id: 5, plan_id: 3, amount_total: Q, amount_used: 250_000, end_time: Math.floor(Date.now() / 1000) + 5 * 86_400, status: "active" } },
  ]);

describe("buyPlan", () => {
  it("creates the order and redirects to its page", async () => {
    const { plan } = await setup();

    await expect(buyPlan({}, form({ planId: String(plan.id) }))).rejects.toThrow(/^REDIRECT \/orders\/[0-9a-f-]{36}$/);

    const rows = await db.select().from(orders);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", userId: current.userId, planId: plan.id });
  });

  it("asks for confirmation when a plan is active, and creates nothing until it is given", async () => {
    const { plan } = await setup();
    activeSubscription(77);

    const state = await buyPlan({}, form({ planId: String(plan.id) }));

    expect(state.error).toMatch(/paket aktif/i);
    expect(state.needsReplace).toMatchObject({ planName: "Bulanan $20", remainingQuota: 750_000 });
    expect(await db.select().from(orders)).toHaveLength(0);
    expect((await readPool()).reservedQuota).toBe(0);

    await expect(buyPlan({}, form({ planId: String(plan.id), replaceConfirmed: "on" }))).rejects.toThrow(/^REDIRECT \/orders\//);
    expect(await db.select().from(orders)).toHaveLength(1);
    expect((await readPool()).reservedQuota).toBe(Q);
  });

  it("rejects a bad plan id, a bogus checkbox value and an unknown plan", async () => {
    await setup();
    expect(await buyPlan({}, form({}))).toEqual({ error: "Paket tidak valid." });
    expect(await buyPlan({}, form({ planId: "abc" }))).toEqual({ error: "Paket tidak valid." });
    expect(await buyPlan({}, form({ planId: "1", replaceConfirmed: "yes" }))).toEqual({ error: "Paket tidak valid." });
    expect(await buyPlan({}, form({ planId: "9999" }))).toEqual({ error: "Paket tidak tersedia." });
  });

  it("refuses a second order with the id of the unpaid one", async () => {
    const { plan } = await setup();
    await expect(buyPlan({}, form({ planId: String(plan.id) }))).rejects.toThrow(/^REDIRECT /);
    const [pending] = await db.select().from(orders);

    const state = await buyPlan({}, form({ planId: String(plan.id) }));

    expect(state).toMatchObject({ error: expect.stringMatching(/batalkan pesanan yang belum dibayar/), pendingOrderId: pending.id });
  });

  it("shows the rate-limit message after too many attempts", async () => {
    const { plan } = await setup();
    let last = {} as Awaited<ReturnType<typeof buyPlan>>;
    for (let i = 0; i < 6; i++) {
      try {
        last = await buyPlan({}, form({ planId: String(plan.id) }));
      } catch {
        last = {}; // redirect on success
      }
    }
    expect(last.error).toMatch(/Terlalu banyak percobaan/);
    expect((await db.select().from(orders).where(eq(orders.userId, current.userId))).length).toBe(1);
  });
});
