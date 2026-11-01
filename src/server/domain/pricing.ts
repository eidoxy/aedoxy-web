import { randomInt } from "node:crypto";

/** QRIS limits per transaction (PRD F01). */
export const MIN_AMOUNT_IDR = 10_000;
export const MAX_AMOUNT_IDR = 10_000_000;

export class AmountOutOfRangeError extends Error {
  constructor(readonly amountIdr: number) {
    super(`Order amount ${amountIdr} is outside Rp${MIN_AMOUNT_IDR}-Rp${MAX_AMOUNT_IDR}`);
    this.name = "AmountOutOfRangeError";
  }
}

/** Flat plan price. No FX, no promo yet: discount is always 0. */
export function computeOrderAmount(plan: { priceIdr: number }) {
  const amountIdr = plan.priceIdr;
  if (!Number.isSafeInteger(amountIdr) || amountIdr < MIN_AMOUNT_IDR || amountIdr > MAX_AMOUNT_IDR) {
    throw new AmountOutOfRangeError(amountIdr);
  }
  return { listPriceIdr: plan.priceIdr, discountIdr: 0, amountIdr };
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** `ADX-<yyyymmdd UTC>-<8 random A-Z0-9>`. Uniqueness is enforced by the orders.trade_no constraint. */
export function generateTradeNo(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  let suffix = "";
  for (let i = 0; i < 8; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `ADX-${date}-${suffix}`;
}
