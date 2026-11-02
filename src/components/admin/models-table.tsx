"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { formatTokens } from "@/lib/format";

export type ModelTableRow = {
  id: number;
  modelName: string;
  provider: string;
  contextIn: number | null;
  contextOut: number | null;
  capabilities: string[];
  officialInputUsdPerM: string | null;
  officialOutputUsdPerM: string | null;
  visible: boolean;
};

const col = dataColumns<ModelTableRow>();

const columns = col.columns([
  col.accessor("modelName", { header: "Model", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("provider", { header: "Provider" }),
  col.accessor((m) => m.contextIn ?? 0, {
    id: "context",
    header: "Context in / out",
    enableGlobalFilter: false,
    cell: (c) => {
      const m = c.row.original;
      return (
        <span className="font-mono text-xs">
          {m.contextIn === null ? "-" : formatTokens(m.contextIn)} / {m.contextOut === null ? "-" : formatTokens(m.contextOut)}
        </span>
      );
    },
  }),
  col.accessor((m) => m.capabilities.join(", "), { id: "capabilities", header: "Kemampuan", cell: (c) => <span className="text-fg-muted">{c.getValue() || "-"}</span> }),
  col.accessor((m) => Number(m.officialInputUsdPerM ?? 0), {
    id: "official",
    header: "Resmi in / out",
    enableGlobalFilter: false,
    cell: (c) => {
      const m = c.row.original;
      return (
        <span className="font-mono text-xs">
          {m.officialInputUsdPerM === null ? "-" : `$${Number(m.officialInputUsdPerM)}`} / {m.officialOutputUsdPerM === null ? "-" : `$${Number(m.officialOutputUsdPerM)}`}
        </span>
      );
    },
  }),
  col.accessor((m) => (m.visible ? "Ya" : "Disembunyikan"), {
    id: "visible",
    header: "Tampil",
    cell: (c) => <Badge variant={c.row.original.visible ? "secondary" : "outline"}>{c.getValue()}</Badge>,
  }),
  col.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    meta: { align: "right" },
    cell: (c) => (
      <Link href={`/admin/models?edit=${encodeURIComponent(c.row.original.modelName)}`} className="text-sm text-primary-ink underline-offset-4 hover:underline">
        Ubah
      </Link>
    ),
  }),
]);

export function ModelsTable({ rows }: { rows: ModelTableRow[] }) {
  return <DataTable data={rows} columns={columns} caption="Metadata model tersimpan" searchLabel="Cari model" getRowId={(m) => m.modelName} empty="Belum ada metadata." />;
}