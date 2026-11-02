import Link from "next/link";
import type { BrandInfo } from "@/lib/brand";
import { cn } from "@/lib/utils";

const LOGO_HEIGHT = 28;

/** Own mark: an open ring with a node, drawn in the brand gradient. A custom logo (admin > Pengaturan situs) replaces it. */
export function LogoMark({ className, brand }: { className?: string; brand?: BrandInfo }) {
  if (brand?.logo) {
    const { src, width, height } = brand.logo;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- served by our own /brand route; SVG is refused at upload, so there is nothing to optimise
      <img
        src={src}
        alt={brand.name}
        width={Math.round((width * LOGO_HEIGHT) / height)}
        height={LOGO_HEIGHT}
        className={cn("h-7 w-auto max-w-44 object-contain object-left", className)}
      />
    );
  }
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

/** `brand` comes from getBrand() (server) or a prop of the server component that renders this one. */
export function Logo({ className, brand }: { className?: string; brand: BrandInfo }) {
  const showName = !(brand.hideWordmark && brand.logo);
  return (
    <Link
      href="/"
      aria-label={`${brand.name}, beranda`}
      className={cn("inline-flex items-center gap-2.5 rounded-md", className)}
    >
      <LogoMark brand={brand} />
      {showName && <span className="text-[19px] font-medium tracking-[-0.03em] text-heading">{brand.name}</span>}
    </Link>
  );
}
