import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminDate, Card } from "@/components/admin/common";
import { PageHeader } from "@/components/console/page-header";
import { RetryFulfillmentForm } from "@/components/admin/retry-fulfillment-form";
import { OrderBadge } from "@/components/panel/order-badge";
import { formatIdr, formatUsd, QUOTA_PER_USD } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getAdminOrder } from "@/server/domain/admin-orders";

export const metadata: Metadata = { title: "Detail order" };

export default function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <OrderDetail params={params} />
    </Suspense>
  );
}

const when = (d: Date | null | undefined) => (d ? adminDate.format(d) : "-");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 border-t border-line py-2 text-sm first:border-t-0">
      <dt className="mono-label">{label}</dt>
      <dd className="min-w-0 break-words text-heading">{children}</dd>
    </div>
  );
}

async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const data = await getAdminOrder(id);
  if (!data) notFound();
  const { order, fulfillment: f, grant } = data;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Order" title={order.tradeNo} actions={<OrderBadge status={order.status} fulfillment={f?.status ?? null} />} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-medium text-heading">Order</h2>
          <dl>
            <Row label="Pembeli">
              {data.name ?? "-"} · {data.email ?? "-"}
            </Row>
            <Row label="Total">{formatIdr(order.amountIdr)} (harga list {formatIdr(order.listPriceIdr)}, diskon {formatIdr(order.discountIdr)})</Row>
            <Row label="Kredit">{formatUsd(order.creditQuota / QUOTA_PER_USD)}</Row>
            <Row label="Dibuat">{when(order.createdAt)}</Row>
            <Row label="Kedaluwarsa">{when(order.expiresAt)}</Row>
            <Row label="Dibayar">{when(order.paidAt)}</Row>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-2 text-lg font-medium text-heading">Invoice Poketo</h2>
          <dl>
            <Row label="Invoice ID">
              <span className="font-mono text-xs">{order.poketoInvoiceId ?? "-"}</span>
            </Row>
            <Row label="Metode">{order.paymentMethod ?? "-"}</Row>
            <Row label="Tautan bayar">
              {order.paymentUrl ? (
                <a href={order.paymentUrl} target="_blank" rel="noreferrer noopener" className="text-primary-ink underline-offset-4 hover:underline">
                  Buka halaman pembayaran
                </a>
              ) : (
                "-"
              )}
            </Row>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-2 text-lg font-medium text-heading">Snapshot paket</h2>
          <pre className="max-h-64 overflow-auto rounded-lg bg-alt p-3 font-mono text-xs text-fg-soft">{JSON.stringify(order.planSnapshot, null, 2)}</pre>
        </Card>

        <Card>
          <h2 className="mb-2 text-lg font-medium text-heading">Fulfillment</h2>
          {!f ? (
            <p className="text-sm text-fg-muted">Belum ada. Dibuat saat order lunas.</p>
          ) : (
            <dl>
              <Row label="Status">{f.status}</Row>
              <Row label="Percobaan">{f.attempts}</Row>
              <Row label="Percobaan berikutnya">{f.status === "succeeded" || f.status === "dead" ? "-" : when(f.nextAttemptAt)}</Row>
              <Row label="Error terakhir">{f.lastError ?? "-"}</Row>
              <Row label="Ref New API">
                <span className="font-mono text-xs">{f.newapiRef ? JSON.stringify(f.newapiRef) : "-"}</span>
              </Row>
            </dl>
          )}
          {f?.status === "dead" && (
            <>
              <p className="mt-4 text-sm text-fg-muted">Worker menyerah setelah percobaan maksimum. Periksa error di atas dan pastikan console bisa dihubungi, lalu coba lagi.</p>
              <RetryFulfillmentForm orderId={order.id} />
            </>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-2 text-lg font-medium text-heading">Grant langganan</h2>
          {!grant ? (
            <p className="text-sm text-fg-muted">Belum ada grant.</p>
          ) : (
            <dl className="grid gap-x-8 sm:grid-cols-2">
              <Row label="User New API">{grant.newapiUserId}</Row>
              <Row label="Subscription">{grant.newapiUserSubscriptionId}</Row>
              <Row label="Kredit">{formatUsd(grant.creditQuota / QUOTA_PER_USD)}</Row>
              <Row label="Berakhir">{when(grant.endsAt)}</Row>
              <Row label="Dikembalikan ke pool">{formatUsd(grant.returnedQuota / QUOTA_PER_USD)}</Row>
              <Row label="Direkonsiliasi">{when(grant.reconciledAt)}</Row>
            </dl>
          )}
        </Card>
      </div>
    </div>
  );
}
