"use client";

import Link from "next/link";
import { adminDate } from "@/components/admin/common";
import { OrderBadge } from "@/components/panel/order-badge";
import { Badge } from "@/components/ui/badge";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { formatIdr } from "@/lib/format";
import type { FulfillmentStatus, GrantPhase, OrderStatus } from "@/lib/order-status";

export type AdminOrderRow = {
  id: string;
  tradeNo: string;
  createdAt: string;
  email: string | null;
  planName: string | null;
  amountIdr: number;
  status: OrderStatus;
  fulfillment: FulfillmentStatus | null;
  grantPhase: GrantPhase | null;
  attempts: number | null;
};

const col = dataColumns<AdminOrderRow>();

const columns = col.columns([
  col.accessor("createdAt", {
    header: "Waktu",
    sortFn: "text",
    cell: (c) => <span className="whitespace-nowrap text-fg-muted">{adminDate.format(new Date(c.getValue()))}</span>,
  }),
  col.accessor("tradeNo", {
    header: "Trade no",
    cell: (c) => (
      <Link href={`/admin/orders/${c.row.original.id}`} className="font-mono text-xs text-primary-ink underline-offset-4 hover:underline">
        {c.getValue()}
      </Link>
    ),
  }),
  col.accessor((o) => o.email ?? "-", { id: "email", header: "Pembeli", cell: (c) => <span className="inline-block max-w-48 truncate align-bottom text-fg-muted">{c.getValue()}</span> }),
  col.accessor((o) => o.planName ?? "-", { id: "planName", header: "Paket" }),
  col.accessor("amountIdr", { header: "Total", meta: { align: "right" }, cell: (c) => <span className="font-mono">{formatIdr(c.getValue())}</span> }),
  col.accessor("status", {
    header: "Status",
    cell: (c) => <OrderBadge status={c.getValue()} fulfillment={c.row.original.fulfillment} grantPhase={c.row.original.grantPhase} />,
  }),
  col.accessor((o) => o.fulfillment ?? "", {
    id: "fulfillment",
    header: "Fulfillment",
    cell: (c) => {
      const o = c.row.original;
      return o.fulfillment ? (
        <Badge variant={o.fulfillment === "dead" ? "destructive" : o.fulfillment === "succeeded" ? "default" : "secondary"}>
          {o.fulfillment}
          {o.attempts ? ` · ${o.attempts}x` : ""}
        </Badge>
      ) : (
        "-"
      );
    },
  }),
]);

/** The server already filtered and paged these rows (URL filters); headers sort the current page only. */
export function AdminOrdersTable({ rows }: { rows: AdminOrderRow[] }) {
  return <DataTable manual data={rows} columns={columns} caption="Order pembeli" getRowId={(o) => o.id} empty="Tidak ada order." />;
}