"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { NavItem } from "./nav-links";

export function MobileNav({ items, ctaHref }: { items: readonly NavItem[]; ctaHref: string }) {
  const pathname = usePathname();
  // Remember the path the menu was opened on: navigating elsewhere closes it without an effect.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <div className="md:hidden">
      <Button
        type="button"
        variant="outline"
        className="size-10 bg-surface p-0"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Tutup menu" : "Buka menu"}
        onClick={() => setOpenOn(open ? null : pathname)}
      >
        {open ? <X className="size-[18px]" aria-hidden /> : <Menu className="size-[18px]" aria-hidden />}
      </Button>
      {open && (
        <nav
          id="mobile-nav"
          aria-label="Menu seluler"
          className="absolute inset-x-0 top-full border-b border-line bg-bg px-5 pt-2 pb-5 shadow-card"
        >
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block border-b border-line py-3.5 text-base text-heading"
                  aria-current={pathname === item.href ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <Button asChild className="mt-4 h-11 w-full text-sm font-semibold">
            <Link href={ctaHref}>Mulai</Link>
          </Button>
        </nav>
      )}
    </div>
  );
}
