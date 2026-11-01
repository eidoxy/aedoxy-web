import Link from "next/link";
import { cn } from "@/lib/utils";

/** Own mark: an open ring with a node, drawn in the brand gradient. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn("size-7", className)} fill="none">
      <defs>
        <linearGradient id="adx-mark" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--grad-from)" />
          <stop offset="1" stopColor="var(--grad-to)" />
        </linearGradient>
      </defs>
      <path
        d="M26 16a10 10 0 1 1-3.2-7.3"
        stroke="url(#adx-mark)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="3.6" fill="url(#adx-mark)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="aedoxy, beranda"
      className={cn("inline-flex items-center gap-2.5 rounded-md", className)}
    >
      <LogoMark />
      <span className="text-[19px] font-medium tracking-[-0.03em] text-heading">aedoxy</span>
    </Link>
  );
}
