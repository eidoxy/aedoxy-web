import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { creditPool, poolLedger } from "@/server/db/schema";

/**
 * Global credit pool (TRD D5, F02). Units are New API quota. Available =
 * total - reserved - sold.
 *
 * Every mutation is ONE conditional `UPDATE ... WHERE` on the single pool row
 * (id = 1) plus a ledger insert on the same transaction handle, so concurrent
 * callers serialise on the row lock and never read-then-write.
 *
 * `pool_ledger.delta` is the signed change of the column each type concerns:
 * reserve +q and release -q (reserved), sell/late_sell +q (sold; `sell` also
 * lowers reserved), *_return -q (sold), admin_adjust +/-n (total).
 */

type ReturnType = "expire_return" | "replace_return" | "refund_return";
type LedgerMeta = { orderId?: string; actorId?: string; note?: string };

const available = sql`${creditPool.totalQuota} - ${creditPool.reservedQuota} - ${creditPool.soldQuota}`;

function assertQuota(quota: number) {
  if (!Number.isSafeInteger(quota) || quota <= 0) throw new RangeError("quota must be a positive integer");
}

async function log(tx: Tx, type: typeof poolLedger.$inferInsert.type, delta: number, meta: LedgerMeta) {
  await tx.insert(poolLedger).values({ type, delta, ...meta });
}

/** Holds `quota` for a pending order. False when the pool has less available. */
export async function reserve(tx: Tx, quota: number, orderId: string): Promise<boolean> {
  assertQuota(quota);
  const rows = await tx
    .update(creditPool)
    .set({ reservedQuota: sql`${creditPool.reservedQuota} + ${quota}`, updatedAt: sql`now()` })
    .where(and(eq(creditPool.id, 1), sql`${available} >= ${quota}`))
    .returning({ id: creditPool.id });
  if (rows.length === 0) return false;
  await log(tx, "reserve", quota, { orderId });
  return true;
}

/** Gives a reservation back. False when fewer than `quota` units are reserved (invariant broken). */
export async function release(tx: Tx, quota: number, orderId: string): Promise<boolean> {
  assertQuota(quota);
  const rows = await tx
    .update(creditPool)
    .set({ reservedQuota: sql`${creditPool.reservedQuota} - ${quota}`, updatedAt: sql`now()` })
    .where(and(eq(creditPool.id, 1), sql`${creditPool.reservedQuota} >= ${quota}`))
    .returning({ id: creditPool.id });
  if (rows.length === 0) return false;
  await log(tx, "release", -quota, { orderId });
  return true;
}

/** Moves a reservation to sold. False when fewer than `quota` units are reserved. */
export async function sell(tx: Tx, quota: number, orderId: string): Promise<boolean> {
  assertQuota(quota);
  const rows = await tx
    .update(creditPool)
    .set({
      reservedQuota: sql`${creditPool.reservedQuota} - ${quota}`,
      soldQuota: sql`${creditPool.soldQuota} + ${quota}`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(creditPool.id, 1), sql`${creditPool.reservedQuota} >= ${quota}`))
    .returning({ id: creditPool.id });
  if (rows.length === 0) return false;
  await log(tx, "sell", quota, { orderId });
  return true;
}

/** Sells without a reservation (payment arrived after the order closed). Unconditional: available may go negative. */
export async function lateSell(tx: Tx, quota: number, orderId: string): Promise<{ available: number }> {
  assertQuota(quota);
  const [row] = await tx
    .update(creditPool)
    .set({ soldQuota: sql`${creditPool.soldQuota} + ${quota}`, updatedAt: sql`now()` })
    .where(eq(creditPool.id, 1))
    .returning({ available: sql<number>`${available}`.mapWith(Number) });
  if (!row) throw new Error("credit_pool row is missing");
  await log(tx, "late_sell", quota, { orderId });
  return row;
}

/** Admin stock change. A negative delta may not push available below zero. Returns false when it would. */
export async function adjust(tx: Tx, input: { delta: number; actorId: string; note: string }): Promise<boolean> {
  const { delta, actorId } = input;
  const note = input.note.trim();
  if (!Number.isSafeInteger(delta) || delta === 0) throw new RangeError("delta must be a non-zero integer");
  if (!note) throw new RangeError("note is required");
  const rows = await tx
    .update(creditPool)
    .set({ totalQuota: sql`${creditPool.totalQuota} + ${delta}`, updatedAt: sql`now()` })
    .where(and(eq(creditPool.id, 1), delta < 0 ? sql`${available} + ${delta} >= 0` : undefined))
    .returning({ id: creditPool.id });
  if (rows.length === 0) return false;
  await log(tx, "admin_adjust", delta, { actorId, note });
  return true;
}

/** Returns unused quota of an expired, replaced or refunded plan to the pool. False when more than `sold` is returned. */
export async function returnQuota(
  tx: Tx,
  input: { type: ReturnType; quota: number; orderId?: string; note?: string },
): Promise<boolean> {
  assertQuota(input.quota);
  const rows = await tx
    .update(creditPool)
    .set({ soldQuota: sql`${creditPool.soldQuota} - ${input.quota}`, updatedAt: sql`now()` })
    .where(and(eq(creditPool.id, 1), sql`${creditPool.soldQuota} >= ${input.quota}`))
    .returning({ id: creditPool.id });
  if (rows.length === 0) return false;
  await log(tx, input.type, -input.quota, { orderId: input.orderId, note: input.note });
  return true;
}
