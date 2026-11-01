import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { db, type Tx } from "@/server/db/client";
import { adminAuditLog, fulfillments, orders, subscriptionGrants, user } from "@/server/db/schema";
import { fulfillSubscription, type FulfillResult } from "@/server/integrations/newapi";
import * as pool from "./pool";

/**
 * Outbox worker side of order activation (TRD D6, 10). A paid order has one
 * `fulfillments` row. `claimDue` leases rows with FOR UPDATE SKIP LOCKED so
 * two worker instances never take the same row, and the bridge call is
 * idempotent per trade_no, so a crash between the call and the bookkeeping
 * only repeats a no-op call.
 */

/** Wait after the 1st, 2nd, ... failed attempt; later attempts reuse the last value. */
const BACKOFF_MS = [10_000, 30_000, 120_000, 600_000, 3_600_000];
export const MAX_ATTEMPTS = 10;
/** A claimed row is invisible to other claimers this long; covers the bridge timeout of a small batch. */
const LEASE_MS = 120_000;

export const backoffMs = (attempts: number) => BACKOFF_MS[Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1];

export type ClaimedFulfillment = { id: number; orderId: string; attempts: number };

/** Leases up to `limit` due rows and counts the attempt. Safe to call from several processes at once. */
export async function claimDue(now: Date, limit = 5): Promise<ClaimedFulfillment[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: fulfillments.id })
      .from(fulfillments)
      .where(and(inArray(fulfillments.status, ["queued", "retrying"]), lte(fulfillments.nextAttemptAt, now)))
      .orderBy(fulfillments.nextAttemptAt, fulfillments.id)
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(fulfillments)
      .set({
        status: "retrying",
        attempts: sql`${fulfillments.attempts} + 1`,
        nextAttemptAt: new Date(now.getTime() + LEASE_MS),
        updatedAt: now,
      })
      .where(
        inArray(
          fulfillments.id,
          due.map((d) => d.id),
        ),
      )
      .returning({ id: fulfillments.id, orderId: fulfillments.orderId, attempts: fulfillments.attempts });
  });
}

/** Returns the unused quota of subscriptions the bridge replaced, once per old grant. */
async function returnReplaced(tx: Tx, replaced: FulfillResult["replaced"], newOrderTradeNo: string, now: Date) {
  for (const r of replaced) {
    const [old] = await tx
      .select()
      .from(subscriptionGrants)
      .where(eq(subscriptionGrants.newapiUserSubscriptionId, r.id))
      .limit(1)
      .for("update");
    if (!old) {
      console.warn("[fulfillment] replaced subscription has no grant, nothing returned", { tradeNo: newOrderTradeNo, subscriptionId: r.id });
      continue;
    }
    if (old.reconciledAt) continue;
    const remaining = Math.min(r.remaining, old.creditQuota);
    await tx.update(subscriptionGrants).set({ reconciledAt: now, returnedQuota: remaining }).where(eq(subscriptionGrants.id, old.id));
    if (remaining > 0) {
      const ok = await pool.returnQuota(tx, {
        type: "replace_return",
        quota: remaining,
        orderId: old.orderId,
        note: `replaced by ${newOrderTradeNo}`,
      });
      if (!ok) throw new Error(`Pool invariant broken: cannot return ${remaining} for replaced subscription ${r.id}`);
    }
  }
}

async function recordSuccess(f: ClaimedFulfillment, order: { tradeNo: string; creditQuota: number }, newapiUserId: number, result: FulfillResult, now: Date) {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(fulfillments).where(eq(fulfillments.id, f.id)).for("update");
    if (!row || row.status === "succeeded") return;

    await tx
      .insert(subscriptionGrants)
      .values({
        orderId: f.orderId,
        newapiUserId,
        newapiUserSubscriptionId: result.subscriptionId,
        creditQuota: order.creditQuota,
        endsAt: result.endsAt,
      })
      .onConflictDoNothing({ target: subscriptionGrants.orderId });
    await returnReplaced(tx, result.replaced, order.tradeNo, now);
    await tx
      .update(fulfillments)
      .set({
        status: "succeeded",
        lastError: null,
        newapiRef: { user_subscription_id: result.subscriptionId, end_time: Math.floor(result.endsAt.getTime() / 1000) },
        updatedAt: now,
      })
      .where(eq(fulfillments.id, f.id));
  });
}

async function recordFailure(f: ClaimedFulfillment, err: unknown, now: Date): Promise<"retry" | "dead"> {
  const message = (err instanceof Error ? err.message : "unknown error").slice(0, 500);
  const dead = f.attempts >= MAX_ATTEMPTS;
  await db.transaction(async (tx) => {
    await tx
      .update(fulfillments)
      .set({
        status: dead ? "dead" : "retrying",
        lastError: message,
        nextAttemptAt: dead ? now : new Date(now.getTime() + backoffMs(f.attempts)),
        updatedAt: now,
      })
      .where(eq(fulfillments.id, f.id));
    if (dead) {
      await tx.insert(adminAuditLog).values({
        actorId: "system:worker",
        action: "fulfillment.dead",
        target: `order:${f.orderId}`,
        after: { attempts: f.attempts, lastError: message },
      });
    }
  });
  if (dead) console.error("[fulfillment] gave up, manual action needed", { orderId: f.orderId, attempts: f.attempts, error: message });
  else console.warn("[fulfillment] attempt failed, will retry", { orderId: f.orderId, attempts: f.attempts, error: message });
  return dead ? "dead" : "retry";
}

async function processOne(f: ClaimedFulfillment, now: Date): Promise<"succeeded" | "retry" | "dead"> {
  try {
    const [row] = await db
      .select({ order: orders, newapiUserId: user.newapiUserId })
      .from(orders)
      .innerJoin(user, eq(user.id, orders.userId))
      .where(eq(orders.id, f.orderId));
    if (!row) throw new Error("order or user not found");
    const planSnapshot = row.order.planSnapshot as { newapiPlanId?: number } | null;
    if (row.newapiUserId == null || !planSnapshot?.newapiPlanId) throw new Error("order has no console user or console plan id");

    const result = await fulfillSubscription({
      tradeNo: row.order.tradeNo,
      newapiUserId: row.newapiUserId,
      newapiPlanId: planSnapshot.newapiPlanId,
      moneyIdr: row.order.amountIdr,
      paymentMethod: row.order.paymentMethod ?? "QRIS",
    });
    await recordSuccess(f, row.order, row.newapiUserId, result, now);
    return "succeeded";
  } catch (err) {
    return recordFailure(f, err, now);
  }
}

export type FulfillmentBatch = { claimed: number; succeeded: number; retried: number; dead: number };

/** Claims one batch of due fulfillments and runs it. Returns zeros when nothing is due. */
export async function processFulfillments(now = new Date(), limit = 5): Promise<FulfillmentBatch> {
  const claimed = await claimDue(now, limit);
  const batch: FulfillmentBatch = { claimed: claimed.length, succeeded: 0, retried: 0, dead: 0 };
  for (const f of claimed) {
    const outcome = await processOne(f, now);
    if (outcome === "succeeded") batch.succeeded++;
    else if (outcome === "retry") batch.retried++;
    else batch.dead++;
  }
  return batch;
}
