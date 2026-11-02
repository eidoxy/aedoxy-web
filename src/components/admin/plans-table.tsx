"use client";

import { ArrowDown, ArrowUp, Copy, MoreHorizontal, Pencil, Power } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { duplicatePlanAction, movePlanAction } from "@/app/(admin)/admin/plans/actions";
import { EnabledDialog, PriceDialog } from "@/components/admin/plan-dialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

/** One menu button per row keeps the action column narrow. Duplicate submits a plain form; enable/disable opens its 2FA dialog. */
function PlanActions({ plan: p }: { plan: PlanTableRow }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const duplicateForm = useRef<HTMLFormElement>(null);
  return (
    <div className="flex justify-end">
      <form ref={duplicateForm} action={duplicatePlanAction}>
        <input type="hidden" name="planId" value={p.id} />
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Aksi untuk ${p.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/admin/plans/${p.id}`}>
              <Pencil /> Ubah
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialogOpen(true)}>
            <Power /> {p.enabled ? "Nonaktifkan" : "Aktifkan"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => duplicateForm.current?.requestSubmit()}>
            <Copy /> Duplikat
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EnabledDialog planId={p.id} name={p.name} enabled={p.enabled} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

const col = dataColumns<PlanTableRow>();

const columns = col.columns([
  col.accessor("sortOrder", {
    header: "Urutan",
    cell: (c) => {
      const p = c.row.original;
      return (
        <div className="flex items-center">
          <span className="w-5 font-mono text-xs text-faint">{p.sortOrder}</span>
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
      <div className="flex w-40 min-w-0 items-center gap-2">
        <Link href={`/admin/plans/${c.row.original.id}`} title={c.getValue()} className="min-w-0 truncate font-medium text-heading underline-offset-4 hover:underline">
          {c.getValue()}
        </Link>
        {c.row.original.badge && (
          <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
            {c.row.original.badge}
          </Badge>
        )}
      </div>
    ),
  }),
  col.accessor("period", { header: "Periode", meta: { hideBelow: "xl" }, cell: (c) => <span className="text-fg-muted">{c.getValue()}</span> }),
  col.accessor("creditQuota", {
    header: "Kredit",
    meta: { align: "right", hideBelow: "xl" },
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
    meta: { align: "right", hideBelow: "wide" },
    cell: (c) => <span className="font-mono text-fg-muted">{c.getValue() ? formatIdr(c.getValue()) : "-"}</span>,
  }),
  // Sold count with revenue underneath: one column instead of two. Sorts by sold count.
  col.accessor("paidCount", {
    header: "Terjual",
    meta: { align: "right", hideBelow: "xl" },
    cell: (c) => (
      <div className="font-mono leading-tight">
        <div>
          {c.getValue()}
          {c.row.original.stockLimit !== null && <span className="text-faint"> / {c.row.original.stockLimit}</span>}
        </div>
        <div className="text-xs text-fg-muted">{formatIdr(c.row.original.revenueIdr)}</div>
      </div>
    ),
  }),
  // Sync and enabled state stacked in one column. The search text covers both.
  col.accessor((p) => `${p.enabled ? "Aktif" : "Nonaktif"} ${p.synced ? "Tersinkron" : "Belum tersinkron"}`, {
    id: "status",
    header: "Status",
    cell: (c) => {
      const p = c.row.original;
      return (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={p.enabled ? "outline" : "secondary"}>{p.enabled ? "Aktif" : "Nonaktif"}</Badge>
          <Badge variant={p.synced ? "default" : "destructive"}>{p.synced ? "Tersinkron" : "Belum tersinkron"}</Badge>
        </div>
      );
    },
  }),
  col.display({
    id: "actions",
    header: () => <span className="sr-only">Aksi</span>,
    enableSorting: false,
    cell: (c) => {
      const p = c.row.original;
      return <PlanActions plan={p} />;
    },
  }),
]);

export function PlansTable({ rows }: { rows: PlanTableRow[] }) {
  return <DataTable data={rows} columns={columns} caption="Daftar paket" compact searchLabel="Cari paket" getRowId={(p) => String(p.id)} empty="Belum ada paket." />;
}
