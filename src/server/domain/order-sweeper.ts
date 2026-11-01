import { and, asc, eq, lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { getInvoice, PoketoError } from "@/server/integrations/poketo";
import { expireOrder, settleOrderPaid } from "./orders";

/**
 * Safety net for lost webhooks (TRD 10): a pending order 10 minutes past its
 * `expires_at` is checked at Poketo. Paid becomes a late sell, anything else
 * expires. Both transitions are the same idempotent ones the webhook uses.
 */

const GRACE_MS = 10 * 60_000;

export type SweepResult = { paid: number; expired: number; skipped: number };

export async function sweepPendingOrders(now = new Date(), limit = 50): Promise<SweepResult> {
  const stale = await db
    .select()
    .from(orders)
    .where(and(eq(orders.status, "pending"), lt(orders.expiresAt, new Date(now.getTime() - GRACE_MS))))
    .orderBy(asc(orders.expiresAt))
    .limit(limit);

  const result: SweepResult = { paid: 0, expired: 0, skipped: 0 };
  for (const order of stale) {
    try {
      let status: string;
      try {
        const invoice = await getInvoice(order.tradeNo);
        if (invoice.amount !== order.amountIdr) {
          console.error("[sweeper] invoice amount does not match order, left untouched", { tradeNo: order.tradeNo });
          result.skipped++;
          continue;
        }
        status = invoice.status;
      } catch (err) {
        if (!(err instanceof PoketoError && err.status === 404)) throw err;
        status = "missing"; // no invoice was ever created for this order
      }

      if (status === "paid") {
        await settleOrderPaid(order.id);
        result.paid++;
      } else {
        await expireOrder(order.id);
        result.expired++;
      }
    } catch (err) {
      // Poketo or the database is unavailable: the order stays pending and the next sweep retries it.
      console.warn("[sweeper] order skipped", { tradeNo: order.tradeNo, error: err instanceof Error ? err.message : "unknown" });
      result.skipped++;
    }
  }
  return result;
}
