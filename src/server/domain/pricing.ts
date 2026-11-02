import { randomInt } from "node:crypto";
import { discountedAmount, isValidPromoValue } from "@/lib/discount";
import type { promotions } from "@/server/db/schema";

/** QRIS limits per transaction (PRD F01). */
export const MIN_AMOUNT_IDR = 10_000;
export const MAX_AMOUNT_IDR = 10_000_000;

export class AmountOutOfRangeError extends Error {
  constructor(readonly amountIdr: number) {
    super(`Order amount ${amountIdr} is outside Rp${MIN_AMOUNT_IDR}-Rp${MAX_AMOUNT_IDR}`);
    this.name = "AmountOutOfRangeError";
  }
}

/** Flat plan price, no discount. No FX anywhere in this file (F04): the buyer pays the flat price. */
export function computeOrderAmount(plan: { priceIdr: number }) {
  const amountIdr = plan.priceIdr;
  if (!Number.isSafeInteger(amountIdr) || amountIdr < MIN_AMOUNT_IDR || amountIdr > MAX_AMOUNT_IDR) {
    throw new AmountOutOfRangeError(amountIdr);
  }
  return { listPriceIdr: plan.priceIdr, discountIdr: 0, amountIdr };
}

export { discountedAmount } from "@/lib/discount";

/** The columns of a promotion the price logic reads. */
export type PromoRule = Pick<
  typeof promotions.$inferSelect,
  "id" | "name" | "code" | "kind" | "value" | "planIds" | "startsAt" | "endsAt" | "maxRedemptions" | "redeemedCount" | "perUserLimit" | "enabled"
>;

export type PromoRejection = "PROMO_NOT_STARTED" | "PROMO_EXPIRED" | "PROMO_EXHAUSTED" | "PROMO_NOT_APPLICABLE" | "PROMO_ALREADY_USED";

/**
 * Why this promotion cannot be used for this plan right now, or null when it can.
 * `userCount` = the buyer's redemptions of it in status reserved or used.
 */
export function promoRejection(p: PromoRule, ctx: { planId: number; now: Date; userCount: number }): PromoRejection | null {
  if (p.planIds.length > 0 && !p.planIds.includes(ctx.planId)) return "PROMO_NOT_APPLICABLE";
  if (!p.enabled || (p.endsAt && p.endsAt <= ctx.now)) return "PROMO_EXPIRED";
  if (p.startsAt && p.startsAt > ctx.now) return "PROMO_NOT_STARTED";
  if (p.maxRedemptions !== null && p.redeemedCount >= p.maxRedemptions) return "PROMO_EXHAUSTED";
  if (p.perUserLimit !== null && ctx.userCount >= p.perUserLimit) return "PROMO_ALREADY_USED";
  return null;
}

export type DiscountChoice = {
  promo: PromoRule | null;
  listPriceIdr: number;
  discountIdr: number;
  amountIdr: number;
  /** Why this discount (or none) was picked; Indonesian, safe to show. */
  reason: string;
};

/**
 * One discount per order: the one that leaves the buyer the lowest price after
 * rounding (ties: lowest id). `promos` must already be usable (see promoRejection).
 */
export function chooseDiscount(plan: { priceIdr: number }, promos: PromoRule[]): DiscountChoice {
  const { listPriceIdr } = computeOrderAmount(plan);
  const options = promos
    .filter((p) => isValidPromoValue(p.kind, p.value))
    .map((promo) => ({ promo, ...discountedAmount(listPriceIdr, promo.kind, promo.value) }))
    .filter((o) => o.discountIdr > 0)
    .sort((a, b) => b.discountIdr - a.discountIdr || a.promo.id - b.promo.id);
  const best = options[0];
  if (!best) return { promo: null, listPriceIdr, discountIdr: 0, amountIdr: listPriceIdr, reason: "Tidak ada diskon yang berlaku." };
  return {
    promo: best.promo,
    listPriceIdr,
    discountIdr: best.discountIdr,
    amountIdr: best.amountIdr,
    reason:
      options.length === 1
        ? `Diskon "${best.promo.name}" berlaku.`
        : `Diskon "${best.promo.name}" dipilih karena paling menguntungkan dari ${options.length} diskon yang berlaku.`,
  };
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** `ADX-<yyyymmdd UTC>-<8 random A-Z0-9>`. Uniqueness is enforced by the orders.trade_no constraint. */
export function generateTradeNo(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `ADX-${date}-${suffix}`;
}
