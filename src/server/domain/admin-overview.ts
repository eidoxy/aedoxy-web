import { count, eq, gte } from "drizzle-orm";
import { db } from "@/server/db/client";
import { creditPool, fulfillments, orders } from "@/server/db/schema";
import { checkPoolInvariant } from "./pool-invariant";

/** Numbers for /admin. Read-only; the invariant check does not write an audit row here. */
export async function getAdminOverview(now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const [[pool], byStatus, [dead], invariant] = await Promise.all([
    db.select().from(creditPool).where(eq(creditPool.id, 1)),
    db.select({ status: orders.status, n: count() }).from(orders).where(gte(orders.createdAt, since)).groupBy(orders.status),
    db.select({ n: count() }).from(fulfillments).where(eq(fulfillments.status, "dead")),
    checkPoolInvariant({ record: false }),
  ]);
  const orders24h: Record<string, number> = {};
  for (const r of byStatus) orders24h[r.status] = r.n;
  return {
    pool: pool
      ? { total: pool.totalQuota, reserved: pool.reservedQuota, sold: pool.soldQuota, available: pool.totalQuota - pool.reservedQuota - pool.soldQuota }
      : null,
    orders24h,
    ordersTotal24h: byStatus.reduce((sum, r) => sum + r.n, 0),
    deadFulfillments: dead.n,
    invariant,
  };
}
