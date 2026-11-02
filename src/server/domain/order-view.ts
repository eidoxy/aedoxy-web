import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { fulfillments, orders, subscriptionGrants } from "@/server/db/schema";
import { isUuid } from "@/server/integrations/poketo";
import { grantColumns, phaseOf, type GrantRow } from "./order-grant";

/** Buyer-facing reads. Every query is scoped to `userId`, so one user can never see another's order. */

const columns = {
  id: orders.id,
  tradeNo: orders.tradeNo,
  status: orders.status,
  planSnapshot: orders.planSnapshot,
  creditQuota: orders.creditQuota,
  amountIdr: orders.amountIdr,
  paymentUrl: orders.paymentUrl,
  expiresAt: orders.expiresAt,
  paidAt: orders.paidAt,
  createdAt: orders.createdAt,
  fulfillment: fulfillments.status,
  ...grantColumns,
};

export type OrderView = Awaited<ReturnType<typeof listOrdersForUser>>[number];

export function planNameOf(order: { planSnapshot: unknown }): string {
  const name = (order.planSnapshot as { name?: unknown } | null)?.name;
  return typeof name === "string" ? name : "Paket";
}

/** Adds `grantPhase`, the input `describeOrder` needs to tell an active plan from a replaced or ended one. */
const withPhase = <T extends GrantRow>(row: T, nowMs: number) => ({ ...row, grantPhase: phaseOf(row, nowMs) });

export async function getOrderForUser(orderId: string, userId: string) {
  if (!isUuid(orderId)) return null; // Postgres would throw on a malformed uuid
  const [row] = await db
    .select(columns)
    .from(orders)
    .leftJoin(fulfillments, eq(fulfillments.orderId, orders.id))
    .leftJoin(subscriptionGrants, eq(subscriptionGrants.orderId, orders.id))
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  return row ? withPhase(row, Date.now()) : null;
}

export async function listOrdersForUser(userId: string, limit = 50) {
  const rows = await db
    .select(columns)
    .from(orders)
    .leftJoin(fulfillments, eq(fulfillments.orderId, orders.id))
    .leftJoin(subscriptionGrants, eq(subscriptionGrants.orderId, orders.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
  const now = Date.now();
  return rows.map((row) => withPhase(row, now));
}

/** The user's one unpaid order, if any (the pending cap is 1). */
export async function getPendingOrderId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, "pending")))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return row?.id ?? null;
}
