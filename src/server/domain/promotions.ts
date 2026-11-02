import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db, type Tx } from "@/server/db/client";
import { promotionRedemptions, promotions } from "@/server/db/schema";
import { chooseDiscount, promoRejection, type DiscountChoice, type PromoRejection, type PromoRule } from "./pricing";

/**
 * Promo side of an order (F06, TRD 9.2). A redemption is `reserved` when the
 * order is created, `used` when it is paid (late payment included) and
 * `released` when the order closes unpaid. `promotions.redeemed_count` counts
 * reserved + used and is incremented with one conditional UPDATE, so the quota
 * cannot be exceeded by parallel orders.
 *
 * Lock order matches orders.ts: order -> plan -> pool -> promotion.
 */

export type PromoErrorCode = PromoRejection | "PROMO_INVALID" | "PROMO_RATE_LIMITED";

const MESSAGES: Record<PromoErrorCode, string> = {
  PROMO_INVALID: "Kode promo tidak dikenali.",
  PROMO_NOT_STARTED: "Promo ini belum dimulai.",
  PROMO_EXPIRED: "Kode promo sudah kedaluwarsa.",
  PROMO_EXHAUSTED: "Kuota promo sudah habis.",
  PROMO_NOT_APPLICABLE: "Kode promo tidak berlaku untuk paket ini.",
  PROMO_ALREADY_USED: "Kode promo ini sudah Anda pakai.",
  PROMO_RATE_LIMITED: "Terlalu banyak percobaan kode. Coba lagi dalam satu menit.",
};

/** `message` is Indonesian and safe to show to the buyer. */
export class PromoError extends Error {
  constructor(readonly code: PromoErrorCode) {
    super(MESSAGES[code]);
    this.name = "PromoError";
  }
}

const CODE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

/** Trims; empty input = no code (null). Anything that cannot be a stored code is rejected without a query. */
export function normalizeCode(raw: string | null | undefined): string | null {
  const code = raw?.trim() ?? "";
  if (code === "") return null;
  if (!CODE_PATTERN.test(code)) throw new PromoError("PROMO_INVALID");
  return code;
}

// shortcut: in-memory per process (resets on restart, not shared between instances); move to Postgres or Redis before running more than one web instance.
const recentLookups = new Map<string, number[]>();
const LOOKUP_MAX = 10;
const LOOKUP_WINDOW_MS = 60_000;

/** Throttles code guessing: at most 10 code lookups per user per minute, on the preview and on the order. */
export function checkCodeRateLimit(userId: string, now = Date.now()) {
  const recent = (recentLookups.get(userId) ?? []).filter((t) => now - t < LOOKUP_WINDOW_MS);
  if (recent.length >= LOOKUP_MAX) {
    recentLookups.set(userId, recent);
    throw new PromoError("PROMO_RATE_LIMITED");
  }
  recent.push(now);
  recentLookups.set(userId, recent);
}

type Reader = typeof db | Tx;

export type LoadedPromos = {
  /** Enabled promotions without a code. */
  autos: PromoRule[];
  /** undefined = the buyer entered no code, null = a code that does not exist. */
  explicit: PromoRule | null | undefined;
  /** promotion id -> this buyer's reserved + used redemptions. */
  used: Map<number, number>;
};

export async function loadPromos(h: Reader, userId: string, rawCode: string | null | undefined): Promise<LoadedPromos> {
  const code = normalizeCode(rawCode);
  const rows = await h
    .select()
    .from(promotions)
    .where(or(and(isNull(promotions.code), eq(promotions.enabled, true)), code ? sql`lower(${promotions.code}) = ${code.toLowerCase()}` : undefined));
  const autos = rows.filter((r) => r.code === null);
  const explicit = code === null ? undefined : (rows.find((r) => r.code !== null) ?? null);
  const used = new Map<number, number>();
  if (rows.length > 0) {
    const counts = await h
      .select({ id: promotionRedemptions.promotionId, n: sql<number>`count(*)`.mapWith(Number) })
      .from(promotionRedemptions)
      .where(
        and(
          eq(promotionRedemptions.userId, userId),
          inArray(promotionRedemptions.status, ["reserved", "used"]),
          inArray(
            promotionRedemptions.promotionId,
            rows.map((r) => r.id),
          ),
        ),
      )
      .groupBy(promotionRedemptions.promotionId);
    for (const c of counts) used.set(c.id, c.n);
  }
  return { autos, explicit, used };
}

export type PlanQuote = {
  choice: DiscountChoice;
  /** Set when the buyer entered a code and it cannot be used for this plan. The choice then holds the best automatic discount only. */
  codeRejection: PromoErrorCode | null;
};

/** Pure: the price one plan gets for this buyer. */
export function quoteFor(plan: { id: number; priceIdr: number }, loaded: LoadedPromos, now: Date): PlanQuote {
  const usable = (p: PromoRule) => promoRejection(p, { planId: plan.id, now, userCount: loaded.used.get(p.id) ?? 0 });
  const candidates = loaded.autos.filter((p) => usable(p) === null);
  let codeRejection: PromoErrorCode | null = null;
  if (loaded.explicit === null) codeRejection = "PROMO_INVALID";
  else if (loaded.explicit) {
    codeRejection = usable(loaded.explicit);
    if (codeRejection === null) candidates.push(loaded.explicit);
  }
  return { choice: chooseDiscount(plan, candidates), codeRejection };
}

/** Quotes for the plans page and the "Terapkan" button. A code lookup is rate limited. */
export async function quotePlans(userId: string, planRows: { id: number; priceIdr: number }[], rawCode?: string | null, now = new Date()) {
  const code = normalizeCode(rawCode);
  if (code !== null) checkCodeRateLimit(userId);
  const loaded = await loadPromos(db, userId, code);
  return new Map(planRows.map((p) => [p.id, quoteFor(p, loaded, now)]));
}

export const rejectionMessage = (code: PromoErrorCode) => MESSAGES[code];

// --- redemption lifecycle (all on the order's transaction) ----------------

/** Takes one unit of quota for a new order and records the reservation. Throws PromoError when the quota or period no longer allows it. */
export async function reserveRedemption(tx: Tx, promo: PromoRule, planId: number, orderId: string, userId: string, now: Date) {
  const rows = await tx
    .update(promotions)
    .set({ redeemedCount: sql`${promotions.redeemedCount} + 1` })
    .where(
      and(
        eq(promotions.id, promo.id),
        eq(promotions.enabled, true),
        sql`(${promotions.maxRedemptions} is null or ${promotions.redeemedCount} < ${promotions.maxRedemptions})`,
        sql`(${promotions.startsAt} is null or ${promotions.startsAt} <= ${now})`,
        sql`(${promotions.endsAt} is null or ${promotions.endsAt} > ${now})`,
      ),
    )
    .returning({ id: promotions.id });
  if (rows.length === 0) {
    // Lost the race for the last unit, or the promo was stopped meanwhile. Say which.
    const [fresh] = await tx.select().from(promotions).where(eq(promotions.id, promo.id));
    throw new PromoError((fresh && promoRejection(fresh, { planId, now, userCount: 0 })) || "PROMO_EXHAUSTED");
  }
  await tx.insert(promotionRedemptions).values({ promotionId: promo.id, orderId, userId });
}

/** The order closed unpaid: the quota unit comes back. No-op for orders without a promo or already released. */
export async function releaseRedemption(tx: Tx, orderId: string) {
  const rows = await tx
    .update(promotionRedemptions)
    .set({ status: "released" })
    .where(and(eq(promotionRedemptions.orderId, orderId), eq(promotionRedemptions.status, "reserved")))
    .returning({ promotionId: promotionRedemptions.promotionId });
  if (rows.length > 0) {
    await tx.update(promotions).set({ redeemedCount: sql`greatest(${promotions.redeemedCount} - 1, 0)` }).where(eq(promotions.id, rows[0].promotionId));
  }
}

/**
 * The order is paid. A reserved redemption becomes used. A released one (the
 * payment came after expiry) becomes used too, and takes its quota unit again
 * even when that goes past the maximum, because the discount was really given.
 */
export async function useRedemption(tx: Tx, orderId: string) {
  const [row] = await tx.select().from(promotionRedemptions).where(eq(promotionRedemptions.orderId, orderId)).for("update");
  if (!row || row.status === "used") return;
  await tx.update(promotionRedemptions).set({ status: "used" }).where(eq(promotionRedemptions.id, row.id));
  if (row.status === "released") {
    await tx.update(promotions).set({ redeemedCount: sql`${promotions.redeemedCount} + 1` }).where(eq(promotions.id, row.promotionId));
  }
}
