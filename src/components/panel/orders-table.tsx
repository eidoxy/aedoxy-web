"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import { CancelOrderButton } from "@/components/panel/cancel-order-button";
import { ToneBadge } from "@/components/panel/order-badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { formatIdr } from "@/lib/format";
import type { OrderListItem } from "@/lib/order-status";

const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export const ORDERS_QUERY_KEY = ["orders"] as const;
const emptyRows: OrderListItem[] = [];

async function fetchOrders(): Promise<OrderListItem[]> {
  const res = await fetch("/api/orders", { cache: "no-store" });
  if (!res.ok) throw new Error(`orders ${res.status}`);
  return ((await res.json()) as { orders: OrderListItem[] }).orders;
}

const col = dataColumns<OrderListItem>();

/** `onChanged` runs after a cancel so the list reloads at once instead of waiting for the next poll. */
const ordersColumns = (onChanged: () => void) =>
  col.columns([
    col.accessor("createdAt", {
      header: "Tanggal",
      sortFn: "text",
      enableGlobalFilter: false,
      cell: (c) => <span className="text-fg-muted">{date.format(new Date(c.getValue()))}</span>,
    }),
    col.accessor("planName", { header: "Paket", cell: (c) => <span className="font-medium text-heading">{c.getValue()}</span> }),
    col.accessor("amountIdr", {
      header: "Total",
      meta: { align: "right" },
      enableGlobalFilter: false,
      cell: (c) => <span className="font-mono">{formatIdr(c.getValue())}</span>,
    }),
    col.accessor("statusLabel", { header: "Status", cell: (c) => <ToneBadge label={c.getValue()} tone={c.row.original.tone} /> }),
    col.display({
      id: "actions",
      header: () => <span className="sr-only">Detail</span>,
      enableSorting: false,
      meta: { align: "right" },
      cell: (c) => (
        <div className="flex items-center justify-end gap-3">
          {c.row.original.pending && <CancelOrderButton orderId={c.row.original.id} size="sm" onDone={onChanged} />}
          <Link href={`/orders/${c.row.original.id}`} className="text-sm font-medium text-primary-ink underline-offset-4 hover:underline">
            Detail
          </Link>
        </div>
      ),
    }),
  ]);
export function OrdersTable() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ORDERS_QUERY_KEY,
    queryFn: fetchOrders,
    refetchOnWindowFocus: true,
    // Poll only while something is still waiting for payment or activation.
    refetchInterval: (q) => (q.state.data?.some((o) => o.pending) ? 15_000 : false),
  });
  // Stable columns: a new array every render would rebuild the row models.
  const columns = useMemo(() => ordersColumns(() => void queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY })), [queryClient]);

  return (
    <DataTable
      data={query.data ?? emptyRows}
      columns={columns}
      caption="Riwayat pesanan"
      searchLabel="Cari paket atau status"
      getRowId={(o) => o.id}
      isLoading={query.isPending}
      error={query.isError && !query.data ? "Riwayat pesanan tidak bisa dimuat." : null}
      onRetry={() => void query.refetch()}
      empty={
        <>
          <p>Belum ada pesanan.</p>
          <Button asChild className="mt-4 h-10 px-4 text-sm font-semibold">
            <Link href="/plans">Lihat paket</Link>
          </Button>
        </>
      }
    />
  );
}
