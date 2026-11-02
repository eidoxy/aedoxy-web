"use client";

import { adminDate } from "@/components/admin/common";
import { StopPromoDialog } from "@/components/admin/promo-forms";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { formatIdr } from "@/lib/format";
import { summarizePromoPlans } from "@/lib/promo-plans";
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

/** "Semua paket" or "N paket"; the full list opens in a popover so a long list never pushes into the next column. */
function PlansCell({ names }: { names: string[] }) {
  const s = summarizePromoPlans(names);
  if (s.all) return <span className="whitespace-nowrap text-fg-muted">{s.label}</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="whitespace-nowrap text-fg-muted underline decoration-dotted underline-offset-4 outline-none hover:text-heading focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`${s.label}: lihat daftar`}>
          {s.label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <ul className="list-disc space-y-1 pl-4">
          {s.names.map((n, i) => (
            <li key={i} className="break-words">
              {n}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

const col = dataColumns<PromoTableRow>();

const columns = col.columns([
  col.accessor("name", {
    header: "Promo",
    cell: (c) => (
      <div className="w-44 min-w-0">
        <div title={c.getValue()} className="truncate font-medium text-heading">
          {c.getValue()}
        </div>
        <div className="truncate font-mono text-xs text-faint">{c.row.original.code ?? "otomatis"}</div>
      </div>
    ),
  }),
  col.accessor((p) => (p.kind === "percent" ? `${p.value}%` : formatIdr(p.value)), { id: "discount", header: "Diskon", cell: (c) => <span className="whitespace-nowrap">{c.getValue()}</span> }),
  col.accessor((p) => (p.planNames.length === 0 ? "Semua paket" : p.planNames.join(", ")), {
    id: "plans",
    header: "Paket",
    cell: (c) => <PlansCell names={c.row.original.planNames} />,
  }),
  col.accessor((p) => p.startsAt ?? "", {
    id: "startsAt",
    header: "Periode (WIB)",
    enableGlobalFilter: false,
    cell: (c) => (
      <span className="block min-w-36 text-xs whitespace-nowrap text-fg-muted">
        {c.row.original.startsAt ? adminDate.format(new Date(c.row.original.startsAt)) : "langsung"}
        <br />
        {c.row.original.endsAt ? adminDate.format(new Date(c.row.original.endsAt)) : "tanpa batas"}
      </span>
    ),
  }),
  col.accessor((p) => STATUS[p.status].label, { id: "status", header: "Status", cell: (c) => <Badge variant={STATUS[c.row.original.status].variant} className="whitespace-nowrap">{c.getValue()}</Badge> }),
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
    cell: (c) => (c.row.original.enabled && c.row.original.status !== "ended" ? <div className="flex justify-end"><StopPromoDialog promoId={c.row.original.id} name={c.row.original.name} /></div> : null),
  }),
]);

export function PromosTable({ rows }: { rows: PromoTableRow[] }) {
  return <DataTable data={rows} columns={columns} caption="Daftar promo" searchLabel="Cari promo" getRowId={(p) => String(p.id)} empty="Belum ada promo." />;
}
