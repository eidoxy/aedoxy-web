"use client";

import { ArrowDown, ArrowUp, Copy } from "lucide-react";
import Link from "next/link";
import { duplicatePlanAction, movePlanAction } from "@/app/(admin)/admin/plans/actions";
import { EnabledDialog, PriceDialog } from "@/components/admin/plan-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { formatIdr, formatUsd, QUOTA_PER_USD } from "@/lib/format";

export type PlanTableRow = {
  id: number;
  name: string;
  badge: string | null;
  period: string;
  sortOrder: number;
  creditQuota: number;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  paidCount: number;
  stockLimit: number | null;
  revenueIdr: number;
  synced: boolean;
  enabled: boolean;
  /** Position in the stored order, so the arrows disable at the ends even while the table is sorted by another column. */
  first: boolean;
  last: boolean;
};

const col = dataColumns<PlanTableRow>();

const columns = col.columns([
  col.accessor("sortOrder", {
    header: "Urutan",
    cell: (c) => {
      const p = c.row.original;
      return (
        <div className="flex items-center gap-1">
          <span className="w-6 font-mono text-xs text-faint">{p.sortOrder}</span>
          <form action={movePlanAction}>
            <input type="hidden" name="planId" value={p.id} />
            <input type="hidden" name="direction" value="up" />
            <Button type="submit" variant="ghost" size="icon-xs" disabled={p.first} aria-label={`Naikkan ${p.name}`}>
              <ArrowUp />
            </Button>
          </form>
          <form action={movePlanAction}>
            <input type="hidden" name="planId" value={p.id} />
            <input type="hidden" name="direction" value="down" />
            <Button type="submit" variant="ghost" size="icon-xs" disabled={p.last} aria-label={`Turunkan ${p.name}`}>
              <ArrowDown />
            </Button>
          </form>
        </div>
      );
    },
  }),
  col.accessor("name", {
    header: "Paket",
    cell: (c) => (
      <>
        <Link href={`/admin/plans/${c.row.original.id}`} className="font-medium text-heading underline-offset-4 hover:underline">
          {c.getValue()}
        </Link>
        {c.row.original.badge && (
          <Badge variant="secondary" className="ml-2">
            {c.row.original.badge}
          </Badge>
        )}
      </>
    ),
  }),
  col.accessor("period", { header: "Periode", cell: (c) => <span className="text-fg-muted">{c.getValue()}</span> }),
  col.accessor("creditQuota", {
    header: "Kredit",
    meta: { align: "right" },
    cell: (c) => <span className="font-mono">{formatUsd(c.getValue() / QUOTA_PER_USD)}</span>,
  }),
  col.accessor("priceIdr", {
    header: "Harga flat",
    meta: { align: "right" },
    cell: (c) => <PriceDialog planId={c.row.original.id} name={c.row.original.name} priceIdr={c.getValue()} />,
  }),
  col.accessor((p) => p.compareAtPriceIdr ?? 0, {
    id: "compareAtPriceIdr",
    header: "Harga coret",
    meta: { align: "right" },
    cell: (c) => <span className="font-mono text-fg-muted">{c.getValue() ? formatIdr(c.getValue()) : "-"}</span>,
  }),
  col.accessor("paidCount", {
    header: "Terjual",
    meta: { align: "right" },
    cell: (c) => (
      <span className="font-mono">
        {c.getValue()}
        {c.row.original.stockLimit !== null && <span className="text-faint"> / {c.row.original.stockLimit}</span>}
      </span>
    ),
  }),
  col.accessor("revenueIdr", { header: "Pendapatan", meta: { align: "right" }, cell: (c) => <span className="font-mono">{formatIdr(c.getValue())}</span> }),
  col.accessor((p) => (p.synced ? "Tersinkron" : "Belum tersinkron"), {
    id: "synced",
    header: "Sinkron",
    cell: (c) => <Badge variant={c.row.original.synced ? "default" : "destructive"}>{c.getValue()}</Badge>,
  }),
  col.accessor((p) => (p.enabled ? "Aktif" : "Nonaktif"), {
    id: "enabled",
    header: "Status",
    cell: (c) => <Badge variant={c.row.original.enabled ? "outline" : "secondary"}>{c.getValue()}</Badge>,
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Aksi</span>,
    enableSorting: false,
    cell: (c) => {
      const p = c.row.original;
      return (
        <div className="flex items-center justify-end gap-1.5">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/plans/${p.id}`}>Ubah</Link>
          </Button>
          <EnabledDialog planId={p.id} name={p.name} enabled={p.enabled} />
          <form action={duplicatePlanAction}>
            <input type="hidden" name="planId" value={p.id} />
            <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Duplikat ${p.name}`}>
              <Copy />
            </Button>
          </form>
        </div>
      );
    },
  }),
]);

export function PlansTable({ rows }: { rows: PlanTableRow[] }) {
  return <DataTable data={rows} columns={columns} caption="Daftar paket" searchLabel="Cari paket" getRowId={(p) => String(p.id)} empty="Belum ada paket." />;
}
