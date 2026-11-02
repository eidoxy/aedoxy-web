import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { adminDate, Card, Field, NativeSelect, PAGE_SIZE, Pagination, pageParam, param, type SearchParams } from "@/components/admin/common";
import { PageHeader } from "@/components/console/page-header";
import { TableCard } from "@/components/console/table-card";
import { OrderBadge } from "@/components/panel/order-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIdr } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { FULFILLMENT_STATUSES, listAdminOrders, ORDER_STATUSES } from "@/server/domain/admin-orders";

export const metadata: Metadata = { title: "Order" };

export default function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <Orders searchParams={searchParams} />
    </Suspense>
  );
}

async function Orders({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = { status: param(sp.status), fulfillment: param(sp.fulfillment), q: param(sp.q) };
  const page = pageParam(sp.page);
  const { rows, total } = await listAdminOrders(filter, page, PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Order" description="Semua order pembeli. Klik trade no untuk melihat invoice, fulfillment, dan grant." />
      <Card>
      <form method="get" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
        <Field label="Status order" htmlFor="status">
          <NativeSelect id="status" name="status" defaultValue={filter.status ?? ""}>
            <option value="">Semua</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Fulfillment" htmlFor="fulfillment">
          <NativeSelect id="fulfillment" name="fulfillment" defaultValue={filter.fulfillment ?? ""}>
            <option value="">Semua</option>
            {FULFILLMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Cari trade_no atau email" htmlFor="q">
          <Input id="q" name="q" defaultValue={filter.q ?? ""} maxLength={100} className="h-9 bg-background" />
        </Field>
        <Button type="submit" className="h-9 px-4 text-sm font-semibold">
          Terapkan
        </Button>
      </form>
      </Card>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Trade no</TableHead>
              <TableHead>Pembeli</TableHead>
              <TableHead>Paket</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Fulfillment</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-fg-muted">
                  Tidak ada order.
                </TableCell>
              </TableRow>
            )}
            {rows.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="whitespace-nowrap text-fg-muted">{adminDate.format(o.createdAt)}</TableCell>
                <TableCell>
                  <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs text-primary-ink underline-offset-4 hover:underline">
                    {o.tradeNo}
                  </Link>
                </TableCell>
                <TableCell className="max-w-48 truncate text-fg-muted">{o.email ?? "-"}</TableCell>
                <TableCell>{o.planName ?? "-"}</TableCell>
                <TableCell className="text-right font-mono">{formatIdr(o.amountIdr)}</TableCell>
                <TableCell>
                  <OrderBadge status={o.status} fulfillment={o.fulfillment} grantPhase={o.grantPhase} />
                </TableCell>
                <TableCell>
                  {o.fulfillment ? (
                    <Badge variant={o.fulfillment === "dead" ? "destructive" : o.fulfillment === "succeeded" ? "default" : "secondary"}>
                      {o.fulfillment}
                      {o.attempts ? ` · ${o.attempts}x` : ""}
                    </Badge>
                  ) : (
                    "-"
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      <Pagination basePath="/admin/orders" params={filter} page={page} total={total} />
    </div>
  );
}
