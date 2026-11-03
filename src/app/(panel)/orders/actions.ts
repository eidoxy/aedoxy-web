"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { orders } from "@/server/db/schema";
import { cancelOrder, settleOrderPaid } from "@/server/domain/orders";
import { cancelInvoice, getInvoice, isUuid, type PoketoInvoice } from "@/server/integrations/poketo";
import { hitRateLimit } from "@/server/rate-limit";
import { requireSession } from "@/server/session";

export type CancelOrderState = {
  error?: string;
  /** The order is now cancelled (also true when it already was). */
  cancelled?: boolean;
  /** The buyer had already paid, so the order was settled instead of cancelled. */
  paid?: boolean;
  notice?: string;
};

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
async function rateLimited(userId: string): Promise<boolean> {
  const r = await hitRateLimit({ key: `orders:cancel:${userId}`, windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX, failOpen: false });
  return !r.allowed;
}

const PAID: CancelOrderState = { paid: true, notice: "Pembayaran sudah kami terima. Paket Anda sedang diaktifkan." };

/**
 * "Batalkan pembayaran". Owner and pending only. If Poketo already has the money the order is settled,
 * never cancelled. A failing Poketo call does not block the local cancel: a buyer who still pays the
 * dead invoice is handled by the late-payment path in `settleOrderPaid`.
 */
export async function cancelMyOrder(orderId: string): Promise<CancelOrderState> {
  const { user } = await requireSession();
  if (typeof orderId !== "string" || !isUuid(orderId)) return { error: "Pesanan tidak ditemukan." };
  if (await rateLimited(user.id)) return { error: "Terlalu banyak percobaan. Coba lagi dalam satu menit." };

  const [order] = await db
    .select({ id: orders.id, tradeNo: orders.tradeNo, status: orders.status, amountIdr: orders.amountIdr })
    .from(orders)
    .where(and(eq(orders.id, orderId), eq(orders.userId, user.id)))
    .limit(1);
  if (!order) return { error: "Pesanan tidak ditemukan." };
  if (order.status === "cancelled") return { cancelled: true };
  if (order.status !== "pending") return { error: "Pesanan ini sudah tidak menunggu pembayaran." };

  let invoice: PoketoInvoice | undefined;
  try {
    invoice = await getInvoice(order.tradeNo);
  } catch (err) {
    console.warn("[orders] invoice lookup before cancel failed", { tradeNo: order.tradeNo, error: err instanceof Error ? err.message : "unknown" });
  }
  if (invoice && invoice.amount !== order.amountIdr) {
    console.error("[orders] invoice amount does not match order, cancel refused", { tradeNo: order.tradeNo });
    return { error: "Pesanan ini tidak bisa dibatalkan otomatis. Hubungi dukungan dengan nomor pesanan Anda." };
  }
  if (invoice?.status === "paid") {
    await settleOrderPaid(order.id);
    return PAID;
  }

  if (!invoice || invoice.status === "pending") {
    try {
      if ((await cancelInvoice(order.tradeNo)).status === "paid") {
        await settleOrderPaid(order.id);
        return PAID;
      }
    } catch (err) {
      console.warn("[orders] invoice cancel failed, cancelling locally", { tradeNo: order.tradeNo, error: err instanceof Error ? err.message : "unknown" });
    }
  }

  if ((await cancelOrder(order.id)) === "closed") return { cancelled: true };
  // Another request got there first (a webhook may have settled it): report what the order is now.
  const [now] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id)).limit(1);
  if (now?.status === "cancelled") return { cancelled: true };
  if (now?.status === "paid") return PAID;
  return { error: "Pesanan ini sudah tidak menunggu pembayaran." };
}
