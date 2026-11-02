import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminOrdersTable } from "@/components/admin/admin-orders-table";
import { Card, Field, NativeSelect, PAGE_SIZE, Pagination, pageParam, param, type SearchParams } from "@/components/admin/common";
import { PageHeader } from "@/components/console/page-header";
import { TablePageSkeleton } from "@/components/console/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/server/admin";
import { FULFILLMENT_STATUSES, listAdminOrders, ORDER_STATUSES } from "@/server/domain/admin-orders";

export const metadata: Metadata = { title: "Order" };

export default function AdminOrdersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<TablePageSkeleton filters cols={7} />}>
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

      <AdminOrdersTable rows={rows.map((o) => ({ ...o, createdAt: o.createdAt.toISOString() }))} />
      <Pagination basePath="/admin/orders" params={filter} page={page} total={total} />
    </div>
  );
}
