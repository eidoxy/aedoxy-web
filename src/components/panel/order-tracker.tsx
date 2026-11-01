"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { OrderBadge } from "@/components/panel/order-badge";
import { Button } from "@/components/ui/button";
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
    <div className="max-w-2xl">
      <p className="eyebrow">Pesanan</p>
      <h1 className="mt-3 text-4xl font-medium tracking-[-0.04em] text-heading">{order.planName}</h1>
      <p className="mt-2 font-mono text-xs text-faint">{order.tradeNo}</p>

      <section aria-live="polite" className="mt-8 rounded-[18px] border border-line bg-surface p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <OrderBadge status={data.status} fulfillment={data.fulfillment} />
          <span className="text-2xl font-medium tracking-[-0.03em] text-heading">{formatIdr(order.amountIdr)}</span>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-fg-muted">{view.detail}</p>

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
      </section>

      <div className="mt-6 flex flex-wrap gap-3">
        {data.status === "paid" && data.fulfillment === "succeeded" && (
          <Button asChild className="h-11 px-5 text-sm font-semibold">
            <Link href="/dashboard">Ke dashboard</Link>
          </Button>
        )}
        {view.final && data.status !== "paid" && (
          <Button asChild className="h-11 px-5 text-sm font-semibold">
            <Link href="/plans">Buat pesanan baru</Link>
          </Button>
        )}
        <Button asChild variant="outline" className="h-11 bg-surface px-5 text-sm font-semibold">
          <Link href="/orders">Semua pesanan</Link>
        </Button>
      </div>
    </div>
  );
}
