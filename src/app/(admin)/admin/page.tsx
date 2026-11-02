import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Stat } from "@/components/admin/common";
import { formatUsd, QUOTA_PER_USD } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getAdminOverview } from "@/server/domain/admin-overview";

export const metadata: Metadata = { title: "Ringkasan" };

export default function AdminHomePage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-72 rounded-[18px] border border-line bg-surface" />}>
      <Overview />
    </Suspense>
  );
}

const usd = (quota: number) => formatUsd(quota / QUOTA_PER_USD);

async function Overview() {
  await requireAdmin();
  const o = await getAdminOverview();
  const inv = o.invariant;

  return (
    <div>
      <PageHeader eyebrow="Admin" title="Ringkasan" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pool tersedia" value={o.pool ? usd(o.pool.available) : "-"} hint={o.pool ? `Terjual ${usd(o.pool.sold)} · direservasi ${usd(o.pool.reserved)}` : "Pool belum dibuat (jalankan db:seed-catalog)"} tone={o.pool && o.pool.available < 0 ? "danger" : undefined} />
        <Stat label="Pool total" value={o.pool ? usd(o.pool.total) : "-"} hint={<Link href="/admin/pool" className="text-primary-ink underline-offset-4 hover:underline">Kelola stok</Link>} />
        <Stat
          label="Order 24 jam"
          value={o.ordersTotal24h}
          hint={`Lunas ${o.orders24h.paid ?? 0} · menunggu ${o.orders24h.pending ?? 0} · kedaluwarsa ${o.orders24h.expired ?? 0} · gagal ${o.orders24h.failed ?? 0}`}
        />
        <Stat
          label="Fulfillment gagal"
          value={o.deadFulfillments}
          tone={o.deadFulfillments > 0 ? "danger" : "success"}
          hint={o.deadFulfillments > 0 ? <Link href="/admin/orders?fulfillment=dead" className="text-primary-ink underline-offset-4 hover:underline">Lihat order tertahan</Link> : "Tidak ada yang tertahan"}
        />
        <Stat
          label="Invarian pool"
          value={!inv ? "-" : inv.ok ? "Cocok" : "Selisih"}
          tone={inv && !inv.ok ? "danger" : "success"}
          hint={!inv ? "Pool belum dibuat" : inv.ok ? "Kolom pool sama dengan ledger" : "Kolom pool tidak sama dengan ledger, perlu diperiksa"}
        />
      </div>
    </div>
  );
}
