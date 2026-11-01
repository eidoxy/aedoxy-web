import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  // large soft blobs
  cloud: { freq: "0.011 0.018", octaves: 4 },
  // dense, leafy grain
  grain: { freq: "0.045 0.06", octaves: 3 },
} as const;

/**
 * Own dither-style illustration (UI-GUIDE: no copying of Guts AI artwork).
 * Two thresholded fractal-noise layers in the teal palette, cut by a 3px pixel
 * grid (.pixel-grid) so it reads as dithered pixel art. Decorative only.
 */
export function DitherPanel({
  seed = 1,
  tone = "cloud",
  className,
  children,
}: {
  seed?: number;
  tone?: keyof typeof TONES;
  className?: string;
  children?: ReactNode;
}) {
  const { freq, octaves } = TONES[tone];
  const mid = `adx-dither-mid-${tone}-${seed}`;
  const hi = `adx-dither-hi-${tone}-${seed}`;
  return (
    <div className={cn("pixel-grid relative isolate overflow-hidden bg-illus", className)}>
      <svg aria-hidden className="absolute inset-0 -z-20 size-full" preserveAspectRatio="none">
        <defs>
          <filter id={mid} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={octaves} seed={seed} />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.37  0 0 0 0 0.68  0 0 0 0 0.6  9 0 0 0 -4.1"
            />
          </filter>
          <filter id={hi} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={octaves} seed={seed + 7} />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0.84  0 0 0 0 0.95  0 0 0 0 0.92  11 0 0 0 -6.1"
            />
          </filter>
        </defs>
        <rect width="100%" height="100%" filter={`url(#${mid})`} />
        <rect width="100%" height="100%" filter={`url(#${hi})`} />
      </svg>
      {children}
    </div>
  );
}
