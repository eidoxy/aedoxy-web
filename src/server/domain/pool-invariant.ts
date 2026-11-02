import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { adminAuditLog } from "@/server/db/schema";

/**
 * Hourly check that credit_pool matches pool_ledger (TRD 10). Each ledger type
 * records the signed change of one column (see pool.ts): total = admin_adjust,
 * reserved = reserve + release - sell, sold = sell + late_sell + *_return.
 * A mismatch is logged and audited; it is never repaired automatically.
 */

export type PoolTotals = { total: number; reserved: number; sold: number };
export type InvariantResult = { ok: boolean; pool: PoolTotals; ledger: PoolTotals };

/** `record: false` is the read-only mode used by the admin pages: no log line, no audit row. */
export async function checkPoolInvariant(opts: { record?: boolean } = {}): Promise<InvariantResult | null> {
  // One statement = one snapshot, so a concurrent reservation cannot show up in only one of the two sides.
  const { rows } = await db.execute<Record<string, string>>(sql`
    select p.total_quota, p.reserved_quota, p.sold_quota,
      l.total, l.reserved, l.sold
    from credit_pool p
    cross join lateral (
      select
        coalesce(sum(delta) filter (where type = 'admin_adjust'), 0) as total,
        coalesce(sum(delta) filter (where type in ('reserve', 'release')), 0)
          - coalesce(sum(delta) filter (where type = 'sell'), 0) as reserved,
        coalesce(sum(delta) filter (where type in ('sell', 'late_sell', 'expire_return', 'replace_return', 'refund_return')), 0) as sold
      from pool_ledger
    ) l
    where p.id = 1
  `);
  const r = rows[0];
  if (!r) return null;

  const pool = { total: Number(r.total_quota), reserved: Number(r.reserved_quota), sold: Number(r.sold_quota) };
  const ledger = { total: Number(r.total), reserved: Number(r.reserved), sold: Number(r.sold) };
  const ok = pool.total === ledger.total && pool.reserved === ledger.reserved && pool.sold === ledger.sold;
  if (!ok && opts.record !== false) {
    console.error("[pool-invariant] credit_pool does not match pool_ledger", { pool, ledger });
    await db.insert(adminAuditLog).values({
      actorId: "system:worker",
      action: "pool.invariant_mismatch",
      target: "credit_pool:1",
      before: pool,
      after: ledger,
    });
  }
  return { ok, pool, ledger };
}
