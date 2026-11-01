import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { plans, poolLedger } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, readPool, resetDatabase } from "@/server/test/helpers";
import { seedCatalog, syncUnsyncedPlans } from "./seed-catalog";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

describe("seedCatalog", () => {
  it("creates the six example plans with quota = USD x 500000", async () => {
    await seedCatalog();
    const rows = await db.select().from(plans).orderBy(plans.sortOrder);
    expect(rows.map((r) => [r.slug, r.creditQuota, r.priceIdr, r.durationValue, r.durationUnit])).toEqual([
      ["mingguan-5", 2_500_000, 20_000, 7, "day"],
      ["mingguan-7", 3_500_000, 25_000, 7, "day"],
      ["mingguan-11", 5_500_000, 35_000, 7, "day"],
      ["bulanan-10", 5_000_000, 40_000, 30, "day"],
      ["bulanan-20", 10_000_000, 55_000, 30, "day"],
      ["bulanan-40", 20_000_000, 100_000, 30, "day"],
    ]);
    expect(rows.every((r) => r.newapiPlanId === null)).toBe(true);
  });

  it("is idempotent: no duplicates, sync state kept, pool balance not reset", async () => {
    await seedCatalog({ poolUsd: 100 });
    await db.update(plans).set({ newapiPlanId: 9 }).where(eq(plans.slug, "bulanan-20"));

    const second = await seedCatalog({ poolUsd: 999 });

    expect(second.poolCreated).toBe(false);
    expect(await db.select().from(plans)).toHaveLength(6);
    const [synced] = await db.select().from(plans).where(eq(plans.slug, "bulanan-20"));
    expect(synced.newapiPlanId).toBe(9);
    expect(await readPool()).toMatchObject({ totalQuota: 50_000_000 });
    expect(await db.select().from(poolLedger)).toHaveLength(1);
  });

  describe("syncUnsyncedPlans", () => {
    let fake: ReturnType<typeof installFakeServers>;
    beforeEach(() => {
      fake = installFakeServers();
    });
    afterEach(() => vi.unstubAllGlobals());

    it("syncs unsynced enabled plans, skips synced and disabled ones, and does not duplicate on rerun", async () => {
      await seedCatalog();
      await db.update(plans).set({ newapiPlanId: 9 }).where(eq(plans.slug, "bulanan-20"));
      await db.update(plans).set({ enabled: false }).where(eq(plans.slug, "bulanan-40"));

      expect(await syncUnsyncedPlans()).toEqual({ synced: 4, failed: [] });
      expect(fake.newapiPlans.size).toBe(4);
      const rows = await db.select().from(plans);
      expect(rows.filter((r) => r.newapiPlanId !== null)).toHaveLength(5);
      expect(rows.find((r) => r.slug === "bulanan-20")?.newapiPlanId).toBe(9);
      expect(rows.find((r) => r.slug === "bulanan-40")?.newapiPlanId).toBeNull();

      expect(await syncUnsyncedPlans()).toEqual({ synced: 0, failed: [] });
      expect(fake.newapiPlans.size).toBe(4);
    });

    it("keeps going when one plan fails, and a rerun syncs only the failed one", async () => {
      await seedCatalog();
      fake.state.rejectPlan = 1; // first push (mingguan-5) is rejected

      const first = await syncUnsyncedPlans();
      expect(first.synced).toBe(5);
      expect(first.failed).toHaveLength(1);
      expect(first.failed[0].slug).toBe("mingguan-5");
      expect(first.failed[0].reason).toMatch(/^rejected:/);

      expect(await syncUnsyncedPlans()).toEqual({ synced: 1, failed: [] });
      expect(fake.newapiPlans.size).toBe(6);
    });
  });

  it("defaults to an empty pool without a ledger row", async () => {
    await seedCatalog();
    expect(await readPool()).toMatchObject({ totalQuota: 0 });
    expect(await db.select().from(poolLedger)).toHaveLength(0);
  });
});
