"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PageHeader } from "@/components/console/page-header";
import { InfoRow } from "@/components/console/section-card";
import { OrderBadge } from "@/components/panel/order-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIdr } from "@/lib/format";
import { describeOrder, formatCountdown, secondsLeft, type FulfillmentStatus, type OrderStatus } from "@/lib/order-status";

export type TrackedOrder = {
  id: string;
  tradeNo: string;
  planName: string;
  amountIdr: number;
  paymentUrl: string | null;
  status: OrderStatus;
  fulfillment: FulfillmentStatus | null;
  expiresAt: string;
};

type StatusPayload = { status: OrderStatus; fulfillment: FulfillmentStatus | null; expiresAt: string };

const POLL_MS = 3_000;

/** Wall clock in whole seconds. 0 on the server and during hydration, so the countdown never mismatches. */
function useNowMs() {
  return useSyncExternalStore(
    (notify) => {
      const timer = setInterval(notify, 1_000);
      return () => clearInterval(timer);
    },
    () => Math.floor(Date.now() / 1_000) * 1_000,
    () => 0,
  );
}

async function fetchStatus(id: string): Promise<StatusPayload> {
  const res = await fetch(`/api/orders/${id}/status`, { cache: "no-store" });
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

export function OrderTracker({ order }: { order: TrackedOrder }) {
  const { data, isError } = useQuery({
    queryKey: ["order-status", order.id],
    queryFn: () => fetchStatus(order.id),
    initialData: { status: order.status, fulfillment: order.fulfillment, expiresAt: order.expiresAt },
    // Light polling that stops by itself once the order reached a final state.
    refetchInterval: (query) => (query.state.data && describeOrder(query.state.data).final ? false : POLL_MS),
  });
  const now = useNowMs();

  const view = describeOrder(data);
  const left = now === 0 ? null : secondsLeft(data.expiresAt, now);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pesanan"
        title={order.planName}
        actions={
          <>
            {data.status === "paid" && data.fulfillment === "succeeded" && (
              <Button asChild className="h-10 px-4 text-sm font-semibold">
                <Link href="/dashboard">Ke dashboard</Link>
              </Button>
            )}
            {view.final && data.status !== "paid" && (
              <Button asChild className="h-10 px-4 text-sm font-semibold">
                <Link href="/plans">Buat pesanan baru</Link>
              </Button>
            )}
            <Button asChild variant="outline" className="h-10 bg-surface px-4 text-sm font-semibold">
              <Link href="/orders">Semua pesanan</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan pesanan</CardTitle>
        </CardHeader>
        <CardContent>
          <dl>
            <InfoRow label="Paket">{order.planName}</InfoRow>
            <InfoRow label="Total">
              <span className="font-medium text-heading">{formatIdr(order.amountIdr)}</span>
            </InfoRow>
            <InfoRow label="Kode pesanan">
              <span className="font-mono text-xs break-all">{order.tradeNo}</span>
            </InfoRow>
            <InfoRow label="Status">
              <OrderBadge status={data.status} fulfillment={data.fulfillment} />
            </InfoRow>
          </dl>
        </CardContent>
      </Card>

      <Card aria-live="polite" className="gap-0 px-6">
        <p className="mono-label">Pembayaran</p>
        <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{view.detail}</p>

        {data.status === "pending" && (
          <div className="mt-6 space-y-4 border-t border-line pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="mono-label">Sisa waktu bayar</span>
              <span className="font-mono text-2xl text-heading tabular-nums" aria-label="Sisa waktu bayar">
                {left === null ? "--:--" : formatCountdown(left)}
              </span>
            </div>
            {left === 0 ? (
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Waktu habis, memeriksa pembayaran terakhir.
              </p>
            ) : order.paymentUrl ? (
              <Button asChild className="h-11 w-full text-sm font-semibold">
                <a href={order.paymentUrl} target="_blank" rel="noopener noreferrer">
                  Bayar dengan QRIS <ArrowUpRight className="size-4" aria-hidden />
                </a>
              </Button>
            ) : (
              <p className="text-sm text-fg-muted">Tautan pembayaran belum tersedia. Muat ulang halaman ini sebentar lagi.</p>
            )}
            <p className="text-xs text-faint">Halaman ini memperbarui status otomatis. Anda tidak perlu memuat ulang setelah membayar.</p>
          </div>
        )}
        {isError && !view.final && <p className="mt-4 text-sm text-warn">Status belum bisa diperbarui. Mencoba lagi otomatis.</p>}
      </Card>
      </div>
    </div>
  );
}
