import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { plans, poolLedger } from "@/server/db/schema";
import { prepareDatabase, readPool, resetDatabase } from "@/server/test/helpers";
import { seedCatalog } from "./seed-catalog";

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

  it("defaults to an empty pool without a ledger row", async () => {
    await seedCatalog();
    expect(await readPool()).toMatchObject({ totalQuota: 0 });
    expect(await db.select().from(poolLedger)).toHaveLength(0);
  });
});
