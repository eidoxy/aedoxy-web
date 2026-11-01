import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { plans } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, resetDatabase, seedPlan, seedPool, seedUser } from "@/server/test/helpers";
import { NewApiError } from "@/server/integrations/newapi";
import { createPlanOrder, OrderError } from "./orders";
import { syncPlan } from "./plan-sync";

let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
});
afterEach(() => vi.unstubAllGlobals());

describe("syncPlan", () => {
  it("creates the plan in New API with pool-only settings and stores the id and synced_at", async () => {
    const plan = await seedPlan({ name: "Mingguan $7", subtitle: "7 hari", durationValue: 7, creditQuota: 3_500_000, newapiPlanId: null });

    const { newapiPlanId } = await syncPlan(plan.id);

    expect(fake.newapiPlans.get(newapiPlanId)).toMatchObject({
      title: "Mingguan $7",
      subtitle: "7 hari",
      duration_unit: "day",
      duration_value: 7,
      total_amount: 3_500_000,
      allow_balance_pay: false,
      allow_wallet_overflow: false,
      quota_reset_period: "never",
    });
    const [row] = await db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row.newapiPlanId).toBe(newapiPlanId);
    expect(row.syncedAt).toBeInstanceOf(Date);
  });

  it("updates in place (PUT) when the plan already has a New API id", async () => {
    const plan = await seedPlan({ newapiPlanId: 42, creditQuota: 9_000_000 });
    await syncPlan(plan.id);
    expect(fake.state.calls).toContain("PUT newapi.test/api/subscription/admin/plans/42");
    expect(fake.newapiPlans.get(42)).toMatchObject({ total_amount: 9_000_000 });
  });

  it("leaves the plan unsynced when New API rejects it", async () => {
    const plan = await seedPlan({ newapiPlanId: null });
    fake.state.rejectPlan = 1;
    await expect(syncPlan(plan.id)).rejects.toBeInstanceOf(NewApiError);
    const [row] = await db.select().from(plans).where(eq(plans.id, plan.id));
    expect(row).toMatchObject({ newapiPlanId: null, syncedAt: null });
  });

  it("fails clearly for an unknown plan", async () => {
    await expect(syncPlan(999)).rejects.toThrow(RangeError);
  });

  it("an unsynced plan cannot be bought, a synced one can", async () => {
    await seedPool(20_000_000);
    const u = await seedUser();
    const plan = await seedPlan({ newapiPlanId: null });

    await expect(createPlanOrder({ userId: u.id, planId: plan.id })).rejects.toMatchObject({
      name: OrderError.name,
      code: "PLAN_UNAVAILABLE",
    });

    await syncPlan(plan.id);
    await expect(createPlanOrder({ userId: u.id, planId: plan.id })).resolves.toMatchObject({ tradeNo: expect.stringMatching(/^ADX-/) });
  });
});
