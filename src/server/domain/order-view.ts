import { and, desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { fulfillments, orders } from "@/server/db/schema";
import { isUuid } from "@/server/integrations/poketo";

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
};

export type OrderView = Awaited<ReturnType<typeof listOrdersForUser>>[number];

export function planNameOf(order: { planSnapshot: unknown }): string {
  const name = (order.planSnapshot as { name?: unknown } | null)?.name;
  return typeof name === "string" ? name : "Paket";
}

export async function getOrderForUser(orderId: string, userId: string) {
  if (!isUuid(orderId)) return null; // Postgres would throw on a malformed uuid
  const [row] = await db
    .select(columns)
    .from(orders)
    .leftJoin(fulfillments, eq(fulfillments.orderId, orders.id))
    .where(and(eq(orders.id, orderId), eq(orders.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function listOrdersForUser(userId: string, limit = 50) {
  return db
    .select(columns)
    .from(orders)
    .leftJoin(fulfillments, eq(fulfillments.orderId, orders.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}
