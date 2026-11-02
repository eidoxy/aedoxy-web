import { sql } from "drizzle-orm";
import { grantPhase, type GrantPhase } from "@/lib/order-status";
import { orders, poolLedger, subscriptionGrants } from "@/server/db/schema";

/**
 * Grant columns for any query that left-joins `subscription_grants` on the order, so every screen
 * derives the same order label from `describeOrder` + `phaseOf`. Replaced = reconciled by a newer purchase:
 * it has a `replace_return` ledger row, or it was reconciled before its natural end (nothing was left to return).
 */
export const grantColumns = {
  grantEndsAt: subscriptionGrants.endsAt,
  grantReconciledAt: subscriptionGrants.reconciledAt,
  grantReplaced: sql<boolean>`coalesce(${subscriptionGrants.reconciledAt} is not null and (${subscriptionGrants.reconciledAt} < ${subscriptionGrants.endsAt} or exists (select 1 from ${poolLedger} where ${poolLedger.orderId} = ${orders.id} and ${poolLedger.type} = 'replace_return')), false)`,
};

export type GrantRow = { grantEndsAt: Date | null; grantReconciledAt: Date | null; grantReplaced: boolean };

/** Input for `describeOrder`'s `grantPhase`. */
export function phaseOf(row: GrantRow, nowMs = Date.now()): GrantPhase {
  const grant = row.grantEndsAt ? { endsAt: row.grantEndsAt, reconciledAt: row.grantReconciledAt, replaced: row.grantReplaced } : null;
  return grantPhase(grant, nowMs);
}
