import { and, count, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { csvRow } from "@/lib/csv";
import { parseWib } from "@/lib/wib";
import { db } from "@/server/db/client";
import { creditPool, orders, poolLedger } from "@/server/db/schema";
import { AdminError, writeAudit, type Actor } from "./audit";
import * as pool from "./pool";
import { checkPoolInvariant } from "./pool-invariant";

/** Admin side of the pool (F02). Writes go through pool.adjust, plus an audit row on the same transaction. */

export type LedgerType = (typeof poolLedger.type.enumValues)[number];
export const LEDGER_TYPES = poolLedger.type.enumValues;

export type PoolOverview = {
  total: number;
  reserved: number;
  sold: number;
  available: number;
  lowThreshold: number;
  /** (reserved + sold) / total, 0 when the pool is empty. */
  usedPct: number;
  /** null = no pool row yet. */
  invariant: Awaited<ReturnType<typeof checkPoolInvariant>>;
};

export async function getPoolOverview(): Promise<PoolOverview | null> {
  const [row] = await db.select().from(creditPool).where(eq(creditPool.id, 1));
  if (!row) return null;
  return {
    total: row.totalQuota,
    reserved: row.reservedQuota,
    sold: row.soldQuota,
    available: row.totalQuota - row.reservedQuota - row.soldQuota,
    lowThreshold: row.lowThresholdQuota,
    usedPct: row.totalQuota > 0 ? Math.round(((row.reservedQuota + row.soldQuota) / row.totalQuota) * 1000) / 10 : 0,
    invariant: await checkPoolInvariant({ record: false }),
  };
}

/** Adds (delta > 0) or removes (delta < 0) stock. A removal may not push available below zero. */
export async function adminAdjustPool(actor: Actor, input: { deltaQuota: number; note: string }) {
  const note = input.note.trim();
  if (!Number.isSafeInteger(input.deltaQuota) || input.deltaQuota === 0) throw new AdminError("Nominal harus bukan nol.");
  if (!note) throw new AdminError("Catatan wajib diisi.");

  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(creditPool).where(eq(creditPool.id, 1)).for("update");
    if (!before) throw new AdminError("Pool belum dibuat. Jalankan db:seed-catalog dulu.");

    const ok = await pool.adjust(tx, { delta: input.deltaQuota, actorId: actor.id, note });
    if (!ok) throw new AdminError("Stok tersedia tidak cukup untuk dikurangi sebanyak itu.");

    const after = before.totalQuota + input.deltaQuota;
    await writeAudit(tx, {
      actor,
      action: "pool.adjust",
      target: "credit_pool:1",
      before: { totalQuota: before.totalQuota },
      after: { totalQuota: after, deltaQuota: input.deltaQuota, note },
    });
    return { totalQuota: after };
  });
}

/** 0 restores the default threshold. */
export async function adminSetLowThreshold(actor: Actor, quota: number) {
  if (!Number.isSafeInteger(quota) || quota < 0) throw new AdminError("Ambang harus bilangan 0 atau lebih.");
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(creditPool).where(eq(creditPool.id, 1)).for("update");
    if (!before) throw new AdminError("Pool belum dibuat. Jalankan db:seed-catalog dulu.");
    await tx.update(creditPool).set({ lowThresholdQuota: quota, updatedAt: new Date() }).where(eq(creditPool.id, 1));
    await writeAudit(tx, {
      actor,
      action: "pool.set_threshold",
      target: "credit_pool:1",
      before: { lowThresholdQuota: before.lowThresholdQuota },
      after: { lowThresholdQuota: quota },
    });
  });
}

export type LedgerFilter = { type?: string; from?: string; to?: string };

/** Unknown types and malformed dates are ignored, so a hand-edited URL cannot break the page. Dates are WIB days, `to` inclusive. */
function ledgerWhere(f: LedgerFilter): SQL | undefined {
  const conds: SQL[] = [];
  if (f.type && (LEDGER_TYPES as readonly string[]).includes(f.type)) conds.push(eq(poolLedger.type, f.type as LedgerType));
  const from = f.from ? parseWib(f.from) : null;
  const to = f.to ? parseWib(f.to) : null;
  if (from) conds.push(gte(poolLedger.createdAt, from));
  if (to) conds.push(lt(poolLedger.createdAt, new Date(to.getTime() + 86_400_000)));
  return conds.length ? and(...conds) : undefined;
}

const ledgerColumns = {
  id: poolLedger.id,
  createdAt: poolLedger.createdAt,
  type: poolLedger.type,
  delta: poolLedger.delta,
  actorId: poolLedger.actorId,
  note: poolLedger.note,
  tradeNo: orders.tradeNo,
};

export async function listLedger(filter: LedgerFilter, page: number, pageSize: number) {
  const where = ledgerWhere(filter);
  const [rows, [{ total }]] = await Promise.all([
    db
      .select(ledgerColumns)
      .from(poolLedger)
      .leftJoin(orders, eq(orders.id, poolLedger.orderId))
      .where(where)
      .orderBy(desc(poolLedger.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(poolLedger).where(where),
  ]);
  return { rows, total };
}

export const LEDGER_CSV_LIMIT = 50_000;

/** Whole filtered ledger as CSV (newest first, capped at LEDGER_CSV_LIMIT rows). */
export async function ledgerCsv(filter: LedgerFilter): Promise<string> {
  const rows = await db
    .select(ledgerColumns)
    .from(poolLedger)
    .leftJoin(orders, eq(orders.id, poolLedger.orderId))
    .where(ledgerWhere(filter))
    .orderBy(desc(poolLedger.id))
    .limit(LEDGER_CSV_LIMIT);
  const lines = [csvRow(["id", "created_at", "type", "delta_quota", "trade_no", "actor_id", "note"])];
  for (const r of rows) lines.push(csvRow([r.id, r.createdAt.toISOString(), r.type, r.delta, r.tradeNo, r.actorId, r.note]));
  return lines.join("\r\n") + "\r\n";
}
