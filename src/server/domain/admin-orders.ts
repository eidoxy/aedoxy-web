import { and, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { adminAuditLog, fulfillments, orders, subscriptionGrants, user } from "@/server/db/schema";
import { isUuid } from "@/server/integrations/poketo";
import { AdminError, writeAudit, type Actor } from "./audit";
import { grantColumns, phaseOf } from "./order-grant";

/** Admin reads of orders and the audit log, plus the one write on orders: retrying a dead fulfillment. No refund action exists yet (policy undecided). */

export const ORDER_STATUSES = orders.status.enumValues;
export const FULFILLMENT_STATUSES = fulfillments.status.enumValues;

/** Makes user input a literal inside LIKE/ILIKE. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type OrderFilter = { status?: string; fulfillment?: string; q?: string };

function orderWhere(f: OrderFilter): SQL | undefined {
  const conds: SQL[] = [];
  if (f.status && (ORDER_STATUSES as readonly string[]).includes(f.status)) conds.push(eq(orders.status, f.status as (typeof ORDER_STATUSES)[number]));
  if (f.fulfillment && (FULFILLMENT_STATUSES as readonly string[]).includes(f.fulfillment)) {
    conds.push(eq(fulfillments.status, f.fulfillment as (typeof FULFILLMENT_STATUSES)[number]));
  }
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    const like = `%${escapeLike(q)}%`;
    conds.push(or(ilike(orders.tradeNo, like), ilike(user.email, like)) as SQL);
  }
  return conds.length ? and(...conds) : undefined;
}

export async function listAdminOrders(filter: OrderFilter, page: number, pageSize: number) {
  const where = orderWhere(filter);
  const base = db.select({ n: count() }).from(orders).leftJoin(user, eq(user.id, orders.userId)).leftJoin(fulfillments, eq(fulfillments.orderId, orders.id)).where(where);
  const [rows, [{ n: total }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        tradeNo: orders.tradeNo,
        status: orders.status,
        amountIdr: orders.amountIdr,
        createdAt: orders.createdAt,
        planName: sql<string | null>`${orders.planSnapshot}->>'name'`,
        email: user.email,
        fulfillment: fulfillments.status,
        attempts: fulfillments.attempts,
        ...grantColumns,
      })
      .from(orders)
      .leftJoin(user, eq(user.id, orders.userId))
      .leftJoin(fulfillments, eq(fulfillments.orderId, orders.id))
      .leftJoin(subscriptionGrants, eq(subscriptionGrants.orderId, orders.id))
      .where(where)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    base,
  ]);
  const now = Date.now();
  return { rows: rows.map((r) => ({ ...r, grantPhase: phaseOf(r, now) })), total };
}

export async function getAdminOrder(orderId: string) {
  if (!isUuid(orderId)) return null; // Postgres would throw on a malformed uuid
  const [row] = await db
    .select({ order: orders, email: user.email, name: user.name, fulfillment: fulfillments, grant: subscriptionGrants, grantReplaced: grantColumns.grantReplaced })
    .from(orders)
    .leftJoin(user, eq(user.id, orders.userId))
    .leftJoin(fulfillments, eq(fulfillments.orderId, orders.id))
    .leftJoin(subscriptionGrants, eq(subscriptionGrants.orderId, orders.id))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!row) return null;
  const { grant, grantReplaced } = row;
  const grantPhase = phaseOf({ grantEndsAt: grant?.endsAt ?? null, grantReconciledAt: grant?.reconciledAt ?? null, grantReplaced }, Date.now());
  return { ...row, grantPhase };
}

/** dead -> queued with a fresh attempt budget; the worker picks it up on its next pass. */
export async function retryDeadFulfillment(actor: Actor, orderId: string) {
  if (!isUuid(orderId)) throw new AdminError("Order tidak valid.");
  await db.transaction(async (tx) => {
    const [f] = await tx.select().from(fulfillments).where(eq(fulfillments.orderId, orderId)).for("update");
    if (!f) throw new AdminError("Order ini belum punya fulfillment.");
    if (f.status !== "dead") throw new AdminError("Hanya fulfillment berstatus dead yang bisa dicoba ulang.");
    await tx.update(fulfillments).set({ status: "queued", attempts: 0, nextAttemptAt: new Date(), updatedAt: new Date() }).where(eq(fulfillments.id, f.id));
    await writeAudit(tx, {
      actor,
      action: "fulfillment.retry",
      target: `order:${orderId}`,
      before: { status: f.status, attempts: f.attempts, lastError: f.lastError },
      after: { status: "queued", attempts: 0 },
    });
  });
}

export type AuditFilter = { action?: string; actor?: string };

/** `action` matches by prefix ("plan" finds plan.update), `actor` by user id or email fragment. */
export async function listAudit(filter: AuditFilter, page: number, pageSize: number) {
  const conds: SQL[] = [];
  const action = filter.action?.trim().slice(0, 60);
  if (action) conds.push(ilike(adminAuditLog.action, `${escapeLike(action)}%`));
  const actor = filter.actor?.trim().slice(0, 100);
  if (actor) conds.push(or(eq(adminAuditLog.actorId, actor), ilike(user.email, `%${escapeLike(actor)}%`)) as SQL);
  const where = conds.length ? and(...conds) : undefined;

  const [rows, [{ n: total }]] = await Promise.all([
    db
      .select({ log: adminAuditLog, email: user.email })
      .from(adminAuditLog)
      .leftJoin(user, eq(user.id, adminAuditLog.actorId))
      .where(where)
      .orderBy(desc(adminAuditLog.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ n: count() }).from(adminAuditLog).leftJoin(user, eq(user.id, adminAuditLog.actorId)).where(where),
  ]);
  return { rows, total };
}
