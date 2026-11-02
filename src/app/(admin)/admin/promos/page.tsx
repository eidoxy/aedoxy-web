import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { param, type SearchParams } from "@/components/admin/common";
import { PromosTable, type PromoTableRow } from "@/components/admin/promos-table";
import { PageHeader } from "@/components/console/page-header";
import { TablePageSkeleton } from "@/components/console/skeletons";
import { FormResult } from "@/components/admin/totp-field";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/server/admin";
import { db } from "@/server/db/client";
import { plans } from "@/server/db/schema";
import { listPromos } from "@/server/domain/admin-promos";

export const metadata: Metadata = { title: "Promo" };

export default function PromosPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<TablePageSkeleton cols={8} />}>
      <Promos searchParams={searchParams} />
    </Suspense>
  );
}

async function Promos({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const created = param((await searchParams).dibuat) === "1";
  const [promos, planRows] = await Promise.all([listPromos(), db.select({ id: plans.id, name: plans.name }).from(plans).orderBy(asc(plans.sortOrder), asc(plans.id))]);
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
        actions={
          <Button asChild className="h-10 px-4 text-sm font-semibold">
            <Link href="/admin/promos/new">Buat promo</Link>
          </Button>
        }
      />

      {created && <FormResult ok="Promo dibuat." />}
      <PromosTable rows={tableRows} />
    </div>
  );
}
