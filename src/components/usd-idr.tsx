import { formatIdr, QUOTA_PER_USD } from "@/lib/format";
import { fxNote, usdToIdr } from "@/lib/fx";
import { cn } from "@/lib/utils";
import type { FxRate } from "@/server/catalog/types";

/**
 * The only place a USD amount becomes a rupiah hint (F04). Always "≈", smaller
 * and dimmer than the flat price, with the source in the tooltip. Renders
 * nothing when conversion is switched off or no rate exists.
 */
export function UsdIdr({
  fx,
  className,
  ...amount
}: ({ usd: number } | { quota: number }) & {
  fx: FxRate | null;
  className?: string;
}) {
  if (!fx || !fx.showConversion) return null;
  const usd = "usd" in amount ? amount.usd : amount.quota / QUOTA_PER_USD;
  return (
    <span title={fxNote(fx)} className={cn("font-mono text-xs text-faint", className)}>
      <span aria-hidden>≈ </span>
      <span className="sr-only">setara </span>
      {formatIdr(usdToIdr(usd, fx))}
    </span>
  );
}

/** Visible source line for pages that show conversions (tooltips do not work on touch). */
export function FxFootnote({ fx, className }: { fx: FxRate | null; className?: string }) {
  if (!fx || !fx.showConversion) return null;
  return (
    <p className={cn("font-mono text-xs text-faint", className)}>
      ≈ adalah perkiraan tampilan, bukan harga. {fxNote(fx)}.
    </p>
  );
}
