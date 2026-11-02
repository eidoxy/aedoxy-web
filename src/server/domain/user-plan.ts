import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { creditPool, orders, subscriptionGrants } from "@/server/db/schema";
import { planNameOf } from "./order-view";

/** Sidebar card reads. Local tables only: the console (New API) is never called while rendering a page. */

/** The latest grant that has not ended and has not been reconciled yet, or null. */
export async function getActivePlanForUser(userId: string, now = new Date()) {
  const [row] = await db
    .select({ planSnapshot: orders.planSnapshot, endsAt: subscriptionGrants.endsAt })
    .from(subscriptionGrants)
    .innerJoin(orders, eq(orders.id, subscriptionGrants.orderId))
    .where(and(eq(orders.userId, userId), gt(subscriptionGrants.endsAt, now), isNull(subscriptionGrants.reconciledAt)))
    .orderBy(desc(subscriptionGrants.endsAt))
    .limit(1);
  return row ? { name: planNameOf(row), endsAt: row.endsAt } : null;
}

/** Quota not yet reserved or sold, or null while the pool row does not exist. */
export async function getPoolAvailable() {
  const [pool] = await db.select().from(creditPool).where(eq(creditPool.id, 1));
  return pool ? pool.totalQuota - pool.reservedQuota - pool.soldQuota : null;
}
