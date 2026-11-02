import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { ActivePlanInfo } from "@/lib/buy-summary";
import { creditPool, orders, plans, subscriptionGrants } from "@/server/db/schema";
import { listActiveSubscriptions } from "@/server/integrations/newapi";
import { planNameOf } from "./order-view";

/** Sidebar card reads. Local tables only: the console (New API) is never called while rendering a page. */

/** The latest grant that has not ended and has not been reconciled yet, or null. */
export async function getActivePlanForUser(userId: string, now = new Date()) {
  const [row] = await db
    .select({ planSnapshot: orders.planSnapshot, endsAt: subscriptionGrants.endsAt, creditQuota: subscriptionGrants.creditQuota })
    .from(subscriptionGrants)
    .innerJoin(orders, eq(orders.id, subscriptionGrants.orderId))
    .where(and(eq(orders.userId, userId), gt(subscriptionGrants.endsAt, now), isNull(subscriptionGrants.reconciledAt)))
    .orderBy(desc(subscriptionGrants.endsAt))
    .limit(1);
  return row ? { name: planNameOf(row), endsAt: row.endsAt, creditQuota: row.creditQuota } : null;
}

/**
 * The running plan a new purchase would replace, as the console sees it (it holds the remaining credit).
 * Null without a console account, without an active plan, or when the console is unreachable:
 * `createPlanOrder` asks for the confirmation itself in that case.
 */
export async function getActiveSubscriptionSummary(newapiUserId: number | null): Promise<ActivePlanInfo | null> {
  if (newapiUserId == null) return null;
  let active;
  try {
    active = (await listActiveSubscriptions(newapiUserId)).sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
  } catch {
    return null;
  }
  if (!active) return null;
  const [current] = await db.select({ name: plans.name }).from(plans).where(eq(plans.newapiPlanId, active.planId)).limit(1);
  return { planName: current?.name ?? "Paket aktif", remainingQuota: active.remainingQuota, endsAt: active.endsAt.toISOString() };
}

/** Quota not yet reserved or sold, or null while the pool row does not exist. */
export async function getPoolAvailable() {
  const [pool] = await db.select().from(creditPool).where(eq(creditPool.id, 1));
  return pool ? pool.totalQuota - pool.reservedQuota - pool.soldQuota : null;
}
