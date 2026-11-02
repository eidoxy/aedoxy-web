import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { creditPool } from "@/server/db/schema";
import { prepareDatabase, resetDatabase, seedPlan, seedPool } from "@/server/test/helpers";
import { loadPlans } from "./plans";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const Q = 500_000;

describe("loadPlans", () => {
  it("lists only plans a buyer can order, with the period as public name and credit in dollars", async () => {
    await seedPool(1000 * Q);
    await seedPlan({ slug: "bulanan-20", subtitle: "Harian", compareAtPriceIdr: 70_000, badge: "Promo", sortOrder: 2 });
    await seedPlan({ slug: "mingguan-7", period: "weekly", durationValue: 7, creditQuota: 7 * Q, priceIdr: 25_000, sortOrder: 1 });
    await seedPlan({ slug: "off", enabled: false });
    await seedPlan({ slug: "unsynced", newapiPlanId: null });

    const list = await loadPlans();
    expect(list.map((p) => p.slug)).toEqual(["mingguan-7", "bulanan-20"]);
    expect(list[0]).toMatchObject({ name: "Mingguan", period: "weekly", durationDays: 7, creditUsd: 7, priceIdr: 25_000, stock: "available" });
    expect(list[1]).toMatchObject({ name: "Bulanan", tagline: "Harian", creditUsd: 20, compareAtPriceIdr: 70_000, badge: "Promo" });
  });

  it("marks stock out when the pool is empty or the plan's own limit is reached, and converts hours to days", async () => {
    await seedPool(1000 * Q);
    await seedPlan({ slug: "limited", stockLimit: 3, soldCount: 3 });
    await seedPlan({ slug: "short", durationUnit: "hour", durationValue: 36 });
    const list = await loadPlans();
    expect(list.find((p) => p.slug === "limited")?.stock).toBe("out");
    expect(list.find((p) => p.slug === "short")).toMatchObject({ stock: "available", durationDays: 2 });

    await db.update(creditPool).set({ totalQuota: 0 });
    expect((await loadPlans()).every((p) => p.stock === "out")).toBe(true);
  });
});
