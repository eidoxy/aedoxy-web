"use client";

import { HideItemForm } from "@/components/admin/activity-forms";
import { adminDate } from "@/components/admin/common";
import { DataTable, dataColumns } from "@/components/ui/data-table";

export type ActivityTableRow = { orderId: string; label: string; plan: string; at: string };

const col = dataColumns<ActivityTableRow>();

const columns = col.columns([
  col.accessor("label", { header: "Tampil sebagai", cell: (c) => <span className="font-mono text-sm">{c.getValue()}</span> }),
  col.accessor("plan", { header: "Paket" }),
  col.accessor("at", {
    header: "Waktu",
    sortFn: "text",
    enableGlobalFilter: false,
    cell: (c) => <span className="whitespace-nowrap text-fg-muted">{adminDate.format(new Date(c.getValue()))}</span>,
  }),
  col.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    meta: { align: "right" },
    cell: (c) => <HideItemForm orderId={c.row.original.orderId} label={c.row.original.label} />,
  }),
]);

export function ActivityTable({ rows }: { rows: ActivityTableRow[] }) {
  return <DataTable data={rows} columns={columns} caption="Item aktif feed aktivitas" searchLabel="Cari item" getRowId={(i) => i.orderId} empty="Belum ada item." />;
}