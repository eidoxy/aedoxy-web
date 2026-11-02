"use client";

import { adminDate } from "@/components/admin/common";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { formatUsd, QUOTA_PER_USD } from "@/lib/format";

export type LedgerRow = { id: number; createdAt: string; type: string; delta: number; tradeNo: string | null; actorId: string | null; note: string | null };

const usd = (quota: number) => formatUsd(quota / QUOTA_PER_USD);
const col = dataColumns<LedgerRow>();

const columns = col.columns([
  col.accessor("createdAt", {
    header: "Waktu",
    sortFn: "text",
    cell: (c) => <span className="whitespace-nowrap text-fg-muted">{adminDate.format(new Date(c.getValue()))}</span>,
  }),
  col.accessor("type", { header: "Tipe", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("delta", {
    header: "Perubahan",
    meta: { align: "right" },
    cell: (c) => (
      <span className="font-mono">
        {c.getValue() > 0 ? "+" : ""}
        {usd(c.getValue())}
      </span>
    ),
  }),
  col.accessor((r) => r.tradeNo ?? "-", { id: "tradeNo", header: "Order", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor((r) => r.actorId ?? "-", { id: "actorId", header: "Oleh", cell: (c) => <span className="inline-block max-w-32 truncate align-bottom font-mono text-xs">{c.getValue()}</span> }),
  col.accessor((r) => r.note ?? "", { id: "note", header: "Catatan", cell: (c) => <span className="inline-block max-w-64 truncate align-bottom text-fg-muted">{c.getValue()}</span> }),
]);

/** The server already filtered and paged these rows (URL filters); headers sort the current page only. */
export function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  return <DataTable manual data={rows} columns={columns} caption="Ledger pool" getRowId={(r) => String(r.id)} empty="Tidak ada baris." />;
}