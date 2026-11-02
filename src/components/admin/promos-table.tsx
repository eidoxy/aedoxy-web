"use client";

import { adminDate } from "@/components/admin/common";
import { StopPromoForm } from "@/components/admin/promo-forms";
import { Badge } from "@/components/ui/badge";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { formatIdr } from "@/lib/format";
import type { PromoStatus } from "@/server/domain/admin-promos";

export type PromoTableRow = {
  id: number;
  name: string;
  code: string | null;
  kind: "percent" | "fixed";
  value: number;
  /** Plan names, already resolved on the server; empty means every plan. */
  planNames: string[];
  startsAt: string | null;
  endsAt: string | null;
  status: PromoStatus;
  enabled: boolean;
  redeemedCount: number;
  maxRedemptions: number | null;
  totalDiscountIdr: number;
  paidOrders: number;
};

const STATUS: Record<PromoStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  scheduled: { label: "Terjadwal", variant: "outline" },
  active: { label: "Aktif", variant: "default" },
  ended: { label: "Selesai", variant: "secondary" },
};

const col = dataColumns<PromoTableRow>();

const columns = col.columns([
  col.accessor("name", {
    header: "Promo",
    cell: (c) => (
      <>
        <div className="font-medium text-heading">{c.getValue()}</div>
        <div className="font-mono text-xs text-faint">{c.row.original.code ?? "otomatis"}</div>
      </>
    ),
  }),
  col.accessor((p) => (p.kind === "percent" ? `${p.value}%` : formatIdr(p.value)), { id: "discount", header: "Diskon", cell: (c) => <span className="whitespace-nowrap">{c.getValue()}</span> }),
  col.accessor((p) => (p.planNames.length === 0 ? "Semua paket" : p.planNames.join(", ")), {
    id: "plans",
    header: "Paket",
    cell: (c) => <span className="inline-block max-w-48 text-fg-muted">{c.getValue()}</span>,
  }),
  col.accessor((p) => p.startsAt ?? "", {
    id: "startsAt",
    header: "Periode (WIB)",
    enableGlobalFilter: false,
    cell: (c) => (
      <span className="text-xs whitespace-nowrap text-fg-muted">
        {c.row.original.startsAt ? adminDate.format(new Date(c.row.original.startsAt)) : "langsung"}
        <br />
        {c.row.original.endsAt ? adminDate.format(new Date(c.row.original.endsAt)) : "tanpa batas"}
      </span>
    ),
  }),
  col.accessor((p) => STATUS[p.status].label, { id: "status", header: "Status", cell: (c) => <Badge variant={STATUS[c.row.original.status].variant}>{c.getValue()}</Badge> }),
  col.accessor("redeemedCount", {
    header: "Pemakaian",
    meta: { align: "right" },
    cell: (c) => (
      <span className="font-mono">
        {c.getValue()} / {c.row.original.maxRedemptions ?? "∞"}
      </span>
    ),
  }),
  col.accessor("totalDiscountIdr", {
    header: "Total potongan",
    meta: { align: "right" },
    cell: (c) => (
      <span className="font-mono">
        {formatIdr(c.getValue())}
        <span className="block text-xs text-faint">{c.row.original.paidOrders} order lunas</span>
      </span>
    ),
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Aksi</span>,
    enableSorting: false,
    cell: (c) => (c.row.original.enabled && c.row.original.status !== "ended" ? <StopPromoForm promoId={c.row.original.id} /> : null),
  }),
]);

export function PromosTable({ rows }: { rows: PromoTableRow[] }) {
  return <DataTable data={rows} columns={columns} caption="Daftar promo" searchLabel="Cari promo" getRowId={(p) => String(p.id)} empty="Belum ada promo." />;
}
