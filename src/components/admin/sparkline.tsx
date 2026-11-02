import { formatIdr } from "@/lib/format";

/** Tiny dependency-free line chart. Needs at least two points, otherwise shows a note. */
export function Sparkline({ points, label }: { points: { date: string; rate: number }[]; label: string }) {
  if (points.length < 2) return <p className="text-sm text-fg-muted">Belum cukup data untuk grafik (butuh minimal 2 hari).</p>;
  const W = 600;
  const H = 120;
  const PAD = 8;
  const rates = points.map((p) => p.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i / (points.length - 1)) * (W - 2 * PAD);
  const y = (r: number) => H - PAD - ((r - min) / span) * (H - 2 * PAD);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-32 w-full text-primary-ink">
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between font-mono text-xs text-faint">
        <span>
          {points[0].date} · {formatIdr(points[0].rate)}
        </span>
        <span>
          min {formatIdr(min)} · maks {formatIdr(max)}
        </span>
        <span>
          {points[points.length - 1].date} · {formatIdr(points[points.length - 1].rate)}
        </span>
      </figcaption>
    </figure>
  );
}
