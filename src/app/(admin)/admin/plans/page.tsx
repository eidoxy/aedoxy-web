import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PlansTable, type PlanTableRow } from "@/components/admin/plans-table";
import { PageHeader } from "@/components/console/page-header";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/server/admin";
import { listAdminPlans } from "@/server/domain/admin-plans";

export const metadata: Metadata = { title: "Paket" };

export default function AdminPlansPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <Plans />
    </Suspense>
  );
}

const PERIOD = { weekly: "Mingguan", monthly: "Bulanan" } as const;
const periodLabel = (p: { period: "weekly" | "monthly" | "custom"; durationValue: number; durationUnit: "hour" | "day" }) =>
  p.period === "custom" ? `Kustom ${p.durationValue} ${p.durationUnit === "day" ? "hari" : "jam"}` : PERIOD[p.period];

async function Plans() {
  await requireAdmin();
  const rows = await listAdminPlans();
  const tableRows: PlanTableRow[] = rows.map((p, i) => ({
    id: p.id,
    name: p.name,
    badge: p.badge,
    period: periodLabel(p),
    sortOrder: p.sortOrder,
    creditQuota: p.creditQuota,
    priceIdr: p.priceIdr,
    compareAtPriceIdr: p.compareAtPriceIdr,
    paidCount: p.paidCount,
    stockLimit: p.stockLimit,
    revenueIdr: p.revenueIdr,
    synced: p.synced,
    enabled: p.enabled,
    first: i === 0,
    last: i === rows.length - 1,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Paket"
        description="Paket tidak dihapus, hanya dinonaktifkan. Paket yang belum tersinkron ke New API tidak bisa dibeli. Klik harga untuk mengubahnya."
        actions={
          <Button asChild className="h-10 px-4 text-sm font-semibold">
            <Link href="/admin/plans/new">Buat paket</Link>
          </Button>
        }
      />

      <PlansTable rows={tableRows} />
      <p className="text-xs text-faint">&ldquo;Terjual&rdquo; = order lunas (dan stok paket bila ada). Pendapatan = jumlah order lunas, tanpa memperhitungkan refund.</p>
    </div>
  );
}
