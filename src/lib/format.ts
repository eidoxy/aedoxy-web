const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** 25000 -> "Rp25.000" (no space, as in the F04 examples). */
export function formatIdr(n: number): string {
  return `Rp${idr.format(Math.round(n))}`;
}

/** 7 -> "$7", 0.3 -> "$0.30", 0.125 -> "$0.125". */
export function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: n < 1 ? 3 : 2,
  })}`;
}

const trim = (s: string) => s.replace(/\.?0+$/, "");

/** 1_050_000 -> "1.05M", 128_000 -> "128K", 2_700_000_000 -> "2.7B". */
export function formatTokens(n: number): string {
  if (n >= 1e9) return `${trim((n / 1e9).toFixed(1))}B`;
  if (n >= 1e6) return `${trim((n / 1e6).toFixed(2))}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

/** Indonesian relative time from an age in milliseconds. */
export function formatAge(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} jam lalu`;
  return `${Math.floor(hours / 24)} hari lalu`;
}

/** Percent saved by a compare-at price, or null when there is no saving. */
export function discountPercent(price: number, compareAt: number | null): number | null {
  if (compareAt === null || compareAt <= price) return null;
  return Math.round((1 - price / compareAt) * 100);
}
