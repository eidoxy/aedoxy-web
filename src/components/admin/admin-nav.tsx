"use client";

import { Coins, LayoutDashboard, Package, ReceiptText, ScrollText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Ringkasan", icon: LayoutDashboard },
  { href: "/admin/pool", label: "Pool", icon: Coins },
  { href: "/admin/plans", label: "Paket", icon: Package },
  { href: "/admin/orders", label: "Order", icon: ReceiptText },
  { href: "/admin/audit", label: "Audit", icon: ScrollText },
  { href: "/admin/security", label: "Keamanan", icon: ShieldCheck },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto md:flex-col">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              active ? "bg-primary-tint text-primary-ink" : "text-fg-muted hover:bg-alt hover:text-heading",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
