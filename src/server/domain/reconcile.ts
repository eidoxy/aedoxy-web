import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { db } from "@/server/db/client";
import { subscriptionGrants } from "@/server/db/schema";
import { findSubscription } from "@/server/integrations/newapi";
import * as pool from "./pool";

/**
 * Subscription expiry (TRD 9.4): once a grant's period is over, the unused
 * credit (total - used, read from New API) goes back to the pool exactly once.
 * `reconciled_at` is checked under a row lock, so two workers cannot both
 * return it. v1 assumes plans never reset their quota periodically.
 */

export type ReconcileResult = { returned: number; skipped: number };

export async function reconcileExpiredGrants(now = new Date(), limit = 50): Promise<ReconcileResult> {
  const due = await db
    .select()
    .from(subscriptionGrants)
    .where(and(isNull(subscriptionGrants.reconciledAt), lte(subscriptionGrants.endsAt, now)))
    .orderBy(asc(subscriptionGrants.endsAt))
    .limit(limit);

  const result: ReconcileResult = { returned: 0, skipped: 0 };
  for (const grant of due) {
    let remaining: number;
    try {
      const sub = await findSubscription(grant.newapiUserId, grant.newapiUserSubscriptionId);
      // Not listed, or still running on the console side: look again next round instead of guessing.
      if (!sub || (sub.status === "active" && sub.endsAt > now)) {
        result.skipped++;
        continue;
      }
      remaining = Math.min(sub.remainingQuota, grant.creditQuota);
    } catch (err) {
      console.warn("[reconcile] console lookup failed", { grantId: grant.id, error: err instanceof Error ? err.message : "unknown" });
      result.skipped++;
      continue;
    }

    const done = await db.transaction(async (tx) => {
      const [locked] = await tx.select().from(subscriptionGrants).where(eq(subscriptionGrants.id, grant.id)).for("update");
      if (!locked || locked.reconciledAt) return false;
      await tx.update(subscriptionGrants).set({ reconciledAt: now, returnedQuota: remaining }).where(eq(subscriptionGrants.id, grant.id));
      if (remaining > 0) {
        const ok = await pool.returnQuota(tx, { type: "expire_return", quota: remaining, orderId: grant.orderId });
        if (!ok) throw new Error(`Pool invariant broken: cannot return ${remaining} for grant ${grant.id}`);
      }
      return true;
    });
    if (done) result.returned++;
    else result.skipped++;
  }
  return result;
}
