"use client";

import { adminDate } from "@/components/admin/common";
import { DataTable, dataColumns } from "@/components/ui/data-table";

export type AuditRow = {
  id: number;
  createdAt: string;
  actor: string;
  action: string;
  target: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
};

/** Compact JSON for a table cell; the full value is in the tooltip. */
function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-faint">-</span>;
  const full = JSON.stringify(value);
  return (
    <code title={full} className="block max-w-72 truncate font-mono text-xs text-fg-soft">
      {full}
    </code>
  );
}

const col = dataColumns<AuditRow>();

const columns = col.columns([
  col.accessor("createdAt", {
    header: "Waktu",
    sortFn: "text",
    cell: (c) => <span className="whitespace-nowrap text-fg-muted">{adminDate.format(new Date(c.getValue()))}</span>,
  }),
  col.accessor("actor", { header: "Pelaku", cell: (c) => <span className="inline-block max-w-40 truncate align-bottom text-xs">{c.getValue()}</span> }),
  col.accessor("action", { header: "Aksi", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor((r) => r.target ?? "-", { id: "target", header: "Target", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.display({ id: "before", header: "Sebelum", enableSorting: false, cell: (c) => <Json value={c.row.original.before} /> }),
  col.display({ id: "after", header: "Sesudah", enableSorting: false, cell: (c) => <Json value={c.row.original.after} /> }),
  col.accessor((r) => r.ip ?? "-", { id: "ip", header: "IP", cell: (c) => <span className="font-mono text-xs text-fg-muted">{c.getValue()}</span> }),
]);

/** The server already filtered and paged these rows (URL filters); headers sort the current page only. */
export function AuditTable({ rows }: { rows: AuditRow[] }) {
  return <DataTable manual data={rows} columns={columns} caption="Catatan audit admin" getRowId={(r) => String(r.id)} empty="Tidak ada catatan." />;
}