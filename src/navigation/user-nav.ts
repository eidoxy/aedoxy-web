import { BookOpen, Boxes, CreditCard, LayoutDashboard, Settings, SquareTerminal } from "lucide-react";
import type { NavGroup } from "./nav";

export const userNav: NavGroup[] = [
  { id: "main", items: [{ title: "Ringkasan", url: "/dashboard", exact: true, icon: LayoutDashboard }] },
  {
    id: "billing",
    label: "Langganan",
    items: [
      {
        title: "Langganan",
        icon: CreditCard,
        subItems: [
          { title: "Pilih paket", url: "/plans" },
          { title: "Riwayat pesanan", url: "/orders" },
        ],
      },
    ],
  },
  {
    id: "build",
    label: "Bangun",
    items: [
      { title: "Console API", icon: SquareTerminal, action: "open-console" },
      { title: "Katalog model", url: "/models", icon: Boxes },
      { title: "Dokumentasi", url: "/docs", icon: BookOpen },
    ],
  },
  { id: "account", label: "Akun", items: [{ title: "Pengaturan", url: "/settings", icon: Settings }] },
];
