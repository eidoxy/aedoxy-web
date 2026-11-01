import { QUOTA_PER_USD } from "@/lib/format";
import { db } from "@/server/db/client";
import { creditPool, plans, poolLedger } from "@/server/db/schema";

/** Example catalog from the product owner. Prices are samples, not final. */
const EXAMPLE_PLANS = [
  { period: "weekly", usd: 5, priceIdr: 20_000 },
  { period: "weekly", usd: 7, priceIdr: 25_000 },
  { period: "weekly", usd: 11, priceIdr: 35_000 },
  { period: "monthly", usd: 10, priceIdr: 40_000 },
  { period: "monthly", usd: 20, priceIdr: 55_000 },
  { period: "monthly", usd: 40, priceIdr: 100_000 },
] as const;

/**
 * Idempotent: the pool row is created only when missing (opening balance goes
 * through pool_ledger so the hourly invariant check holds), and plans are
 * upserted by slug. Sync state, stock counters and `enabled` are never touched.
 */
export async function seedCatalog(opts: { poolUsd?: number } = {}) {
  const poolUsd = opts.poolUsd ?? 0;
  if (!Number.isFinite(poolUsd) || poolUsd < 0) throw new RangeError("poolUsd must be a non-negative number");
  const openingQuota = Math.round(poolUsd * QUOTA_PER_USD);

  const poolCreated = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(creditPool)
      .values({ id: 1, totalQuota: openingQuota })
      .onConflictDoNothing({ target: creditPool.id })
      .returning({ id: creditPool.id });
    if (rows.length > 0 && openingQuota > 0) {
      await tx.insert(poolLedger).values({ type: "admin_adjust", delta: openingQuota, actorId: "seed", note: "opening balance (seed)" });
    }
    return rows.length > 0;
  });

  for (const [i, p] of EXAMPLE_PLANS.entries()) {
    const weekly = p.period === "weekly";
    const row = {
      name: `${weekly ? "Mingguan" : "Bulanan"} $${p.usd}`,
      slug: `${p.period === "weekly" ? "mingguan" : "bulanan"}-${p.usd}`,
      period: p.period,
      durationUnit: "day" as const,
      durationValue: weekly ? 7 : 30,
      creditQuota: p.usd * QUOTA_PER_USD,
      priceIdr: p.priceIdr,
      sortOrder: i + 1,
    };
    await db
      .insert(plans)
      .values(row)
      .onConflictDoUpdate({ target: plans.slug, set: { ...row, updatedAt: new Date() } });
  }
  return { poolCreated, plans: EXAMPLE_PLANS.length };
}
