import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PromoForm } from "@/components/admin/promo-forms";
import { PromosTable, type PromoTableRow } from "@/components/admin/promos-table";
import { PageHeader } from "@/components/console/page-header";
import { TablePageSkeleton } from "@/components/console/skeletons";
import { requireAdmin } from "@/server/admin";
import { db } from "@/server/db/client";
import { plans } from "@/server/db/schema";
import { listPromos } from "@/server/domain/admin-promos";

export const metadata: Metadata = { title: "Promo" };

export default function PromosPage() {
  return (
    <Suspense fallback={<TablePageSkeleton cols={8} />}>
      <Promos />
    </Suspense>
  );
}

async function Promos() {
  await requireAdmin();
  const [promos, planRows] = await Promise.all([listPromos(), db.select({ id: plans.id, name: plans.name, priceIdr: plans.priceIdr }).from(plans).orderBy(asc(plans.sortOrder), asc(plans.id))]);
  const planName = new Map(planRows.map((p) => [p.id, p.name]));
  const tableRows: PromoTableRow[] = promos.map((p) => ({
    id: p.id,
    name: p.name,
    code: p.code,
    kind: p.kind,
    value: p.value,
    planNames: p.planIds.map((id) => planName.get(id) ?? `#${id}`),
    startsAt: p.startsAt?.toISOString() ?? null,
    endsAt: p.endsAt?.toISOString() ?? null,
    status: p.status,
    enabled: p.enabled,
    redeemedCount: p.redeemedCount,
    maxRedemptions: p.maxRedemptions,
    totalDiscountIdr: p.totalDiscountIdr,
    paidOrders: p.paidOrders,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Promo dan diskon"
        description="Satu diskon per order: yang paling menguntungkan pembeli. Potongan dihitung dari harga flat, bukan harga coret. Harga akhir dibulatkan ke atas per Rp100 dan tidak kurang dari Rp10.000."
      />

      <PromosTable rows={tableRows} />

      <h2 className="pt-4 text-xl font-medium tracking-[-0.02em] text-heading">Buat promo</h2>
      <PromoForm plans={planRows} />
    </div>
  );
}
