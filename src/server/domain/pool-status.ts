import { and, eq, isNotNull, min } from "drizzle-orm";
import { db } from "@/server/db/client";
import { creditPool, plans } from "@/server/db/schema";

export type PoolStatus = "available" | "low" | "empty";

/** Used when credit_pool.low_threshold_quota is 0: $50 at 500_000 quota per $1. */
export const DEFAULT_LOW_THRESHOLD_QUOTA = 50 * 500_000;

export function classifyPool(input: { available: number; smallestPlanQuota: number | null; lowThresholdQuota: number }): PoolStatus {
  const { available, smallestPlanQuota, lowThresholdQuota } = input;
  // Less than the cheapest sellable plan means nobody can buy, so it counts as empty.
  if (available <= 0 || (smallestPlanQuota !== null && available < smallestPlanQuota)) return "empty";
  return available <= (lowThresholdQuota > 0 ? lowThresholdQuota : DEFAULT_LOW_THRESHOLD_QUOTA) ? "low" : "available";
}

/** Public stock signal. Deliberately no numbers: the amounts are business data. */
export async function getPoolStatus(): Promise<PoolStatus> {
  const [row] = await db.select().from(creditPool).where(eq(creditPool.id, 1));
  if (!row) return "empty";
  const [{ smallest }] = await db
    .select({ smallest: min(plans.creditQuota) })
    .from(plans)
    .where(and(eq(plans.enabled, true), isNotNull(plans.newapiPlanId)));
  return classifyPool({
    available: row.totalQuota - row.reservedQuota - row.soldQuota,
    smallestPlanQuota: smallest === null ? null : Number(smallest),
    lowThresholdQuota: row.lowThresholdQuota,
  });
}
