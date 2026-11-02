import { and, count, eq, inArray, sql } from "drizzle-orm";
import { env } from "@/env";
import { ensureConsoleAccountForUser } from "@/server/account";
import { db, type Tx } from "@/server/db/client";
import { fulfillments, orders, plans, user } from "@/server/db/schema";
import { listActiveSubscriptions, NewApiError } from "@/server/integrations/newapi";
import { createInvoice } from "@/server/integrations/poketo";
import * as pool from "./pool";
import { isPlanSynced, planIsSynced } from "./plan-sellable";
import { computeOrderAmount, generateTradeNo } from "./pricing";

/**
 * Order state machine (TRD 9.1, 9.2). `settleOrderPaid`, `expireOrder`,
 * `cancelOrder` and `markOrderRefunded` are idempotent transactions that lock
 * the order row; the webhook and the (later) worker both call them. Code
 * inside a transaction only uses the `tx` handle: touching `db` there could
 * starve the connection pool under load.
 */

export const INVOICE_TTL_MINUTES = 15;
export const MAX_PENDING_ORDERS = 3;
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;

export type OrderErrorCode =
  | "RATE_LIMITED"
  | "USER_NOT_ELIGIBLE"
  | "NEWAPI_UNAVAILABLE"
  | "PLAN_UNAVAILABLE"
  | "OUT_OF_SALE_PERIOD"
  | "REPLACE_CONFIRMATION_REQUIRED"
  | "TOO_MANY_PENDING"
  | "PURCHASE_LIMIT"
  | "OUT_OF_STOCK"
  | "PAYMENT_UNAVAILABLE";

export type ReplaceDetails = { planName: string; remainingQuota: number; endsAt: Date };

/** `message` is safe to show to the user (Indonesian). */
export class OrderError extends Error {
  constructor(
    readonly code: OrderErrorCode,
    message: string,
    readonly details?: ReplaceDetails,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

// shortcut: in-memory per process, so it resets on restart and is not shared between instances; move to Postgres or Redis before running more than one web instance.
const recentCreates = new Map<string, number[]>();

function checkRateLimit(userId: string, now = Date.now()) {
  const recent = (recentCreates.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    recentCreates.set(userId, recent);
    throw new OrderError("RATE_LIMITED", "Terlalu banyak percobaan. Coba lagi dalam satu menit.");
  }
  recent.push(now);
  recentCreates.set(userId, recent);
}

export type CreatePlanOrderInput = { userId: string; planId: number; replaceConfirmed?: boolean };
export type CreatePlanOrderResult = { orderId: string; tradeNo: string; paymentUrl: string };

export async function createPlanOrder(input: CreatePlanOrderInput): Promise<CreatePlanOrderResult> {
  const { userId, planId } = input;
  checkRateLimit(userId);

  let newapiUserId: number | null;
  try {
    newapiUserId = await ensureConsoleAccountForUser(userId);
  } catch (err) {
    if (err instanceof NewApiError) throw new OrderError("NEWAPI_UNAVAILABLE", "Layanan konsol sedang tidak tersedia. Coba lagi nanti.");
    throw err;
  }
  if (newapiUserId == null) throw new OrderError("USER_NOT_ELIGIBLE", "Verifikasi email Anda terlebih dahulu.");

  const [account] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).limit(1);
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!account || !plan || !plan.enabled || !isPlanSynced(plan)) {
    throw new OrderError("PLAN_UNAVAILABLE", "Paket tidak tersedia.");
  }
  const now = new Date();
  if ((plan.saleStartsAt && plan.saleStartsAt > now) || (plan.saleEndsAt && plan.saleEndsAt <= now)) {
    throw new OrderError("OUT_OF_SALE_PERIOD", "Paket ini sedang tidak dijual.");
  }
  const price = computeOrderAmount(plan);

  // One active plan per user: replacing it needs explicit confirmation (PRD section 11, F03).
  let active;
  try {
    active = (await listActiveSubscriptions(newapiUserId)).sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime())[0];
  } catch (err) {
    if (err instanceof NewApiError) throw new OrderError("NEWAPI_UNAVAILABLE", "Layanan konsol sedang tidak tersedia. Coba lagi nanti.");
    throw err;
  }
  if (active && !input.replaceConfirmed) {
    const [current] = await db.select({ name: plans.name }).from(plans).where(eq(plans.newapiPlanId, active.planId)).limit(1);
    throw new OrderError(
      "REPLACE_CONFIRMATION_REQUIRED",
      "Anda masih punya paket aktif. Konfirmasi penggantian diperlukan.",
      { planName: current?.name ?? "Paket aktif", remainingQuota: active.remainingQuota, endsAt: active.endsAt },
    );
  }

  const order = await db.transaction(async (tx) => {
    // Serialises this user's concurrent orders so the pending and purchase caps cannot be raced.
    await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");

    const [{ pending }] = await tx
      .select({ pending: count() })
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.status, "pending")));
    if (pending >= MAX_PENDING_ORDERS) {
      throw new OrderError("TOO_MANY_PENDING", `Anda punya ${MAX_PENDING_ORDERS} pesanan yang belum dibayar. Selesaikan atau tunggu kedaluwarsa dulu.`);
    }
    if (plan.maxPurchasePerUser > 0) {
      const [{ bought }] = await tx
        .select({ bought: count() })
        .from(orders)
        .where(and(eq(orders.userId, userId), eq(orders.planId, plan.id), inArray(orders.status, ["pending", "paid"])));
      if (bought >= plan.maxPurchasePerUser) {
        throw new OrderError("PURCHASE_LIMIT", "Batas pembelian paket ini sudah tercapai.");
      }
    }

    let inserted;
    for (let attempt = 0; attempt < 5 && !inserted; attempt++) {
      [inserted] = await tx
        .insert(orders)
        .values({
          tradeNo: generateTradeNo(now),
          userId,
          planId: plan.id,
          planSnapshot: {
            name: plan.name,
            slug: plan.slug,
            period: plan.period,
            durationUnit: plan.durationUnit,
            durationValue: plan.durationValue,
            creditQuota: plan.creditQuota,
            newapiPlanId: plan.newapiPlanId,
          },
          creditQuota: plan.creditQuota,
          ...price,
          expiresAt: new Date(now.getTime() + INVOICE_TTL_MINUTES * 60_000),
        })
        .onConflictDoNothing({ target: orders.tradeNo })
        .returning();
    }
    if (!inserted) throw new Error("Could not allocate a unique trade_no");

    // Conditional updates: a failed one throws, which rolls back the order insert above.
    const stock = await tx
      .update(plans)
      .set({ soldCount: sql`${plans.soldCount} + 1`, updatedAt: sql`now()` })
      .where(and(eq(plans.id, plan.id), eq(plans.enabled, true), planIsSynced, sql`(${plans.stockLimit} is null or ${plans.soldCount} < ${plans.stockLimit})`))
      .returning({ id: plans.id });
    if (stock.length === 0 || !(await pool.reserve(tx, plan.creditQuota, inserted.id))) {
      throw new OrderError("OUT_OF_STOCK", "Stok paket habis.");
    }
    return inserted;
  });

  const siteUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  let invoice;
  try {
    invoice = await createInvoice({
      amount: order.amountIdr,
      title: plan.name,
      customer: { name: account.name, email: account.email },
      items: [{ name: plan.name, quantity: 1, price: order.amountIdr }],
      expiresInMinutes: INVOICE_TTL_MINUTES,
      referenceId: order.tradeNo,
      // Poketo only accepts https redirect URLs; skip it for a local http site URL.
      redirectUrl: siteUrl.startsWith("https://") ? `${siteUrl}/orders/${order.id}` : undefined,
      metadata: { order_id: order.id },
    });
  } catch (err) {
    console.error("[orders] invoice creation failed", { tradeNo: order.tradeNo, error: err instanceof Error ? err.message : "unknown" });
    await closeOrder(order.id, "failed");
    throw new OrderError("PAYMENT_UNAVAILABLE", "Pembayaran sedang tidak tersedia. Coba lagi nanti.");
  }

  await db.update(orders).set({ poketoInvoiceId: invoice.id, paymentUrl: invoice.paymentUrl }).where(eq(orders.id, order.id));
  return { orderId: order.id, tradeNo: order.tradeNo, paymentUrl: invoice.paymentUrl };
}

async function lockOrder(tx: Tx, orderId: string) {
  const [row] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  return row;
}

type OrderRow = NonNullable<Awaited<ReturnType<typeof lockOrder>>>;

async function markPaid(tx: Tx, order: OrderRow) {
  await tx.update(orders).set({ status: "paid", paidAt: new Date() }).where(eq(orders.id, order.id));
  await tx.insert(fulfillments).values({ orderId: order.id }).onConflictDoNothing({ target: fulfillments.orderId });
}

export type SettleOutcome = "settled" | "late_settled" | "noop" | "not_found";

/**
 * Invoice is paid. Pending order: reservation becomes sold. Order already
 * expired, cancelled or failed (buyer paid late): sold += q without a
 * reservation, the pool may go negative. Already paid or refunded: no-op.
 */
export async function settleOrderPaid(orderId: string): Promise<SettleOutcome> {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order) return "not_found";

    if (order.status === "pending") {
      if (!(await pool.sell(tx, order.creditQuota, order.id))) {
        throw new Error(`Pool invariant broken: no reservation to sell for order ${order.tradeNo}`);
      }
      await markPaid(tx, order);
      return "settled";
    }

    if (order.status === "expired" || order.status === "cancelled" || order.status === "failed") {
      // Lock order everywhere: plan row first, then pool row (same as createPlanOrder) to avoid deadlocks.
      // The reservation was released with the order, so the plan stock counter comes back too.
      await tx.update(plans).set({ soldCount: sql`${plans.soldCount} + 1` }).where(eq(plans.id, order.planId));
      const { available } = await pool.lateSell(tx, order.creditQuota, order.id);
      await markPaid(tx, order);
      console.warn("[orders] late payment activated", { tradeNo: order.tradeNo, was: order.status, poolAvailable: available });
      return "late_settled";
    }

    return "noop";
  });
}

export type CloseOutcome = "closed" | "noop" | "not_found";

/** Pending order ends without payment: releases the pool reservation and the plan stock. */
async function closeOrder(orderId: string, status: "expired" | "cancelled" | "failed"): Promise<CloseOutcome> {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order) return "not_found";
    if (order.status !== "pending") return "noop";

    await tx.update(orders).set({ status }).where(eq(orders.id, order.id));
    await tx.update(plans).set({ soldCount: sql`greatest(${plans.soldCount} - 1, 0)` }).where(eq(plans.id, order.planId));
    if (!(await pool.release(tx, order.creditQuota, order.id))) {
      throw new Error(`Pool invariant broken: no reservation to release for order ${order.tradeNo}`);
    }
    return "closed";
  });
}

export const expireOrder = (orderId: string) => closeOrder(orderId, "expired");
export const cancelOrder = (orderId: string) => closeOrder(orderId, "cancelled");

/** Poketo reported a refund or chargeback. Only the status changes; the refund itself is manual (F01). */
export async function markOrderRefunded(orderId: string): Promise<"refunded" | "noop" | "not_found"> {
  return db.transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order) return "not_found";
    if (order.status !== "paid") return "noop";
    await tx.update(orders).set({ status: "refunded" }).where(eq(orders.id, order.id));
    console.warn("[orders] order refunded at Poketo, manual follow-up needed", { tradeNo: order.tradeNo });
    return "refunded";
  });
}
