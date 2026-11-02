import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/console/page-header";
import { OrdersTable } from "@/components/panel/orders-table";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Pesanan" };

export default function OrdersPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Pesanan" title="Riwayat pesanan" description="Semua pembelian paket Anda, terbaru di atas." />
      <Suspense fallback={null}>
        <Guard />
      </Suspense>
      <OrdersTable />
    </div>
  );
}

/** Second layer of the session check; the rows themselves come from GET /api/orders. */
async function Guard() {
  await requireSession();
  return null;
}