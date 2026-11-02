import { QUOTA_PER_USD } from "./format";
import { categoryLabel } from "./plan-category";

/** What the purchase-confirmation dialog shows, and when its main button may be pressed. Pure, so it is unit-tested. */

export type ActivePlanInfo = { planName: string; remainingQuota: number; endsAt: string };

export type BuySummaryInput = {
  name: string;
  period: "weekly" | "monthly" | "custom";
  durationUnit: "hour" | "day";
  durationValue: number;
  creditQuota: number;
  /** Amount to pay. */
  finalIdr: number;
  /** Price shown struck through: the list price under a promotion, else the admin's compare-at price. */
  strikeIdr: number | null;
  /** Set when a promotion (code or automatic) lowers the price. */
  promo: { name: string; code: string | null; discountIdr: number } | null;
  active: ActivePlanInfo | null;
  pendingOrderId: string | null;
};

export type BuySummary = {
  name: string;
  periodLabel: string;
  validity: string;
  creditUsd: number;
  finalIdr: number;
  strikeIdr: number | null;
  discountIdr: number;
  promoLabel: string | null;
  replace: (ActivePlanInfo & { remainingUsd: number }) | null;
  pendingOrderId: string | null;
};

export const durationLabel = (p: { durationUnit: "hour" | "day"; durationValue: number }) => `${p.durationValue} ${p.durationUnit === "day" ? "hari" : "jam"}`;

export function buildBuySummary(input: BuySummaryInput): BuySummary {
  const { promo, active } = input;
  return {
    name: input.name,
    periodLabel: categoryLabel(input),
    validity: `${durationLabel(input)} sejak pembayaran`,
    creditUsd: input.creditQuota / QUOTA_PER_USD,
    finalIdr: input.finalIdr,
    strikeIdr: input.strikeIdr !== null && input.strikeIdr > input.finalIdr ? input.strikeIdr : null,
    discountIdr: promo?.discountIdr ?? 0,
    promoLabel: promo ? (promo.code ? `${promo.name} (kode ${promo.code})` : promo.name) : null,
    replace: active ? { ...active, remainingUsd: active.remainingQuota / QUOTA_PER_USD } : null,
    pendingOrderId: input.pendingOrderId,
  };
}

/**
 * "Lanjut ke pembayaran" is enabled only when nothing is in flight, no unpaid order exists,
 * and a plan replacement (if any) was confirmed. `replaceRequired` also covers a replacement the server asked for.
 */
export function canContinue(state: { replaceRequired: boolean; replaceConfirmed: boolean; pendingOrderId: string | null; busy: boolean; disabled?: boolean }): boolean {
  return !state.busy && !state.disabled && state.pendingOrderId === null && (!state.replaceRequired || state.replaceConfirmed);
}
