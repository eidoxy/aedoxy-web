/**
 * Discount arithmetic (F06), free of server imports so the admin form can
 * preview with the very same function the order uses.
 *
 * final = max(Rp10.000, list - cut), rounded UP to Rp100, never above the list
 * price. The cut comes from the flat price, not from a strike-through price.
 */

export const MIN_FINAL_PRICE_IDR = 10_000;
export const PERCENT_MIN = 1;
export const PERCENT_MAX = 90;

export type PromoKind = "percent" | "fixed";

export function isValidPromoValue(kind: PromoKind, value: number): boolean {
  if (!Number.isSafeInteger(value)) return false;
  return kind === "percent" ? value >= PERCENT_MIN && value <= PERCENT_MAX : value >= 1 && value <= 100_000_000;
}

export function discountedAmount(listPriceIdr: number, kind: PromoKind, value: number): { discountIdr: number; amountIdr: number } {
  if (!Number.isSafeInteger(listPriceIdr) || listPriceIdr <= 0) throw new RangeError("list price must be a positive integer");
  if (!isValidPromoValue(kind, value)) throw new RangeError(`invalid ${kind} value ${value}`);
  // Integer math: ceil(list * (100 - pct) / 100 / 100) * 100, without floating point.
  const raw = kind === "percent" ? Math.floor((listPriceIdr * (100 - value) + 9_999) / 10_000) * 100 : Math.ceil((listPriceIdr - value) / 100) * 100;
  const amountIdr = Math.min(listPriceIdr, Math.max(MIN_FINAL_PRICE_IDR, raw));
  return { discountIdr: listPriceIdr - amountIdr, amountIdr };
}
