import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { creditPool } from "@/server/db/schema";
import { classifyPool, DEFAULT_LOW_THRESHOLD_QUOTA } from "@/server/domain/pool-status";
import { prepareDatabase, resetDatabase, seedPlan, seedPool } from "@/server/test/helpers";
import { GET } from "./route";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const status = async () => {
  const res = await GET();
  return { body: await res.json(), cache: res.headers.get("cache-control") };
};

describe("GET /api/public/pool-status", () => {
  it("is empty without a pool row", async () => {
    expect((await status()).body).toEqual({ status: "empty" });
  });

  it("returns only the status, cacheable for 60 s", async () => {
    await seedPlan({ creditQuota: 2_500_000 });
    await seedPool(10 * DEFAULT_LOW_THRESHOLD_QUOTA);
    const { body, cache } = await status();
    expect(body).toEqual({ status: "available" });
    expect(cache).toContain("s-maxage=60");
  });

  it("is low at or under the threshold and empty below the cheapest plan", async () => {
    await seedPlan({ creditQuota: 2_500_000 });
    await seedPool(DEFAULT_LOW_THRESHOLD_QUOTA);
    expect((await status()).body.status).toBe("low");

    await db.update(creditPool).set({ lowThresholdQuota: 1_000_000, totalQuota: 1_000_000 }).where(eq(creditPool.id, 1));
    expect((await status()).body.status).toBe("empty"); // 1M < the 2.5M plan

    await db.update(creditPool).set({ totalQuota: 3_000_000, lowThresholdQuota: 3_000_000 }).where(eq(creditPool.id, 1));
    expect((await status()).body.status).toBe("low"); // the column overrides the default

    await db.update(creditPool).set({ totalQuota: 3_000_001 }).where(eq(creditPool.id, 1));
    expect((await status()).body.status).toBe("available"); // one unit above the threshold
    await db.update(creditPool).set({ totalQuota: 3_000_001, reservedQuota: 3_000_001 }).where(eq(creditPool.id, 1));
    expect((await status()).body.status).toBe("empty");
  });
});

describe("classifyPool", () => {
  it("handles a negative pool (late sells) and no sellable plans", () => {
    expect(classifyPool({ available: -5, smallestPlanQuota: null, lowThresholdQuota: 0 })).toBe("empty");
    expect(classifyPool({ available: 1, smallestPlanQuota: null, lowThresholdQuota: 0 })).toBe("low");
  });
});
