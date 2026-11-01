import type { FxRate } from "@/server/catalog/types";
import { formatIdr } from "./format";

/**
 * USD -> IDR for display only (F04 / TRD D7). Never use this for an order
 * amount: the buyer always pays the flat plan price.
 */
export function usdToIdr(usd: number, fx: FxRate): number {
  const step = fx.roundingStepIdr > 0 ? fx.roundingStepIdr : 1;
  return Math.round((usd * fx.rate) / step) * step;
}

const dateFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "Kurs Rp18.148 / $1, ECB (Frankfurter), 30 Okt 2026" */
export function fxNote(fx: FxRate): string {
  return `Kurs ${formatIdr(fx.rate)} / $1, ${fx.source}, ${dateFmt.format(new Date(fx.sourceDate))}`;
}
