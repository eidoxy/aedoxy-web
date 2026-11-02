import { Activity, Banknote, Boxes, Coins, LayoutDashboard, Package, ReceiptText, ScrollText, ShieldCheck, Tag } from "lucide-react";
import type { NavGroup } from "./nav";

const security: NavGroup = {
  id: "system",
  label: "Sistem",
  items: [
    { title: "Feed aktivitas", url: "/admin/activity", icon: Activity },
    { title: "Audit log", url: "/admin/audit", icon: ScrollText },
    { title: "Keamanan", url: "/admin/security", icon: ShieldCheck },
  ],
};

export const adminNav: NavGroup[] = [
  { id: "main", items: [{ title: "Ringkasan", url: "/admin", exact: true, icon: LayoutDashboard }] },
  {
    id: "sales",
    label: "Penjualan",
    items: [
      {
        title: "Paket",
        icon: Package,
        subItems: [
          { title: "Semua paket", url: "/admin/plans" },
          { title: "Buat paket", url: "/admin/plans/new" },
        ],
      },
      { title: "Promo", url: "/admin/promos", icon: Tag },
      { title: "Order", url: "/admin/orders", icon: ReceiptText },
    ],
  },
  {
    id: "resources",
    label: "Sumber daya",
    items: [
      { title: "Pool kredit", url: "/admin/pool", icon: Coins },
      { title: "Model", url: "/admin/models", icon: Boxes },
      { title: "Kurs", url: "/admin/fx", icon: Banknote },
    ],
  },
  security,
];

/** An admin without 2FA is redirected to /admin/security by every other page, so that is all the menu offers. */
export function adminNavFor(has2fa: boolean): NavGroup[] {
  return has2fa ? adminNav : [{ id: "system", items: security.items.filter((i) => i.url === "/admin/security") }];
}
