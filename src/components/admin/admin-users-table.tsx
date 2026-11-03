"use client";

import Link from "next/link";
import { adminDate } from "@/components/admin/common";
import { Badge } from "@/components/ui/badge";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import type { ConsoleState } from "@/server/domain/admin-users";

export type AdminUserRow = {
  id: string;
  username: string | null;
  email: string;
  role: "user" | "admin";
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  banned: boolean;
  banExpires: string | null;
  deleted: boolean;
  console: ConsoleState;
  createdAt: string;
};

export const CONSOLE_LABEL: Record<ConsoleState, string> = { linked: "Tertaut", unlinked: "Belum tertaut", disabled: "Dinonaktifkan di console" };

const col = dataColumns<AdminUserRow>();

const truncated = (text: string, className = "") => (
  <span title={text} className={`inline-block max-w-56 truncate align-bottom ${className}`}>
    {text}
  </span>
);

const columns = col.columns([
  col.accessor((u) => u.username ?? "-", {
    id: "username",
    header: "Username",
    cell: (c) => (
      <Link href={`/admin/users/${c.row.original.id}`} className="font-mono text-xs text-primary-ink underline-offset-4 hover:underline">
        {c.getValue()}
      </Link>
    ),
  }),
  col.accessor("email", { header: "Email", cell: (c) => truncated(c.getValue(), "text-fg-muted") }),
  col.accessor("role", { header: "Peran", cell: (c) => <Badge variant={c.getValue() === "admin" ? "default" : "secondary"}>{c.getValue()}</Badge> }),
  col.accessor((u) => (u.emailVerified ? "Ya" : "Belum"), { id: "emailVerified", header: "Email terverifikasi" }),
  col.accessor((u) => (u.twoFactorEnabled ? "Aktif" : "Tidak"), { id: "twoFactor", header: "2FA" }),
  col.accessor((u) => (u.deleted ? "Dihapus" : u.banned ? "Diblokir" : "Aktif"), {
    id: "status",
    header: "Status",
    cell: (c) => {
      const u = c.row.original;
      if (u.deleted) return <Badge variant="destructive">Dihapus</Badge>;
      return u.banned ? (
        <Badge variant="destructive">{u.banExpires ? `Diblokir s/d ${adminDate.format(new Date(u.banExpires))}` : "Diblokir"}</Badge>
      ) : (
        <Badge variant="secondary">Aktif</Badge>
      );
    },
  }),
  col.accessor((u) => CONSOLE_LABEL[u.console], { id: "console", header: "Console" }),
  col.accessor("createdAt", {
    header: "Terdaftar",
    sortFn: "text",
    cell: (c) => <span className="whitespace-nowrap text-fg-muted">{adminDate.format(new Date(c.getValue()))}</span>,
  }),
]);

/** The server already filtered and paged these rows (URL filters); headers sort the current page only. */
export function AdminUsersTable({ rows }: { rows: AdminUserRow[] }) {
  return <DataTable manual data={rows} columns={columns} caption="Pengguna" getRowId={(u) => u.id} empty="Tidak ada pengguna." />;
}
