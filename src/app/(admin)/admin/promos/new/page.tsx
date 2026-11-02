import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PromoForm } from "@/components/admin/promo-forms";
import { PageHeader } from "@/components/console/page-header";
import { FormPageSkeleton } from "@/components/console/skeletons";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/server/admin";
import { db } from "@/server/db/client";
import { plans } from "@/server/db/schema";

export const metadata: Metadata = { title: "Buat promo" };

export default function NewPromoPage() {
  return (
    <Suspense fallback={<FormPageSkeleton fields={8} />}>
      <NewPromo />
    </Suspense>
  );
}

async function NewPromo() {
  await requireAdmin();
  const planRows = await db.select({ id: plans.id, name: plans.name, priceIdr: plans.priceIdr }).from(plans).orderBy(asc(plans.sortOrder), asc(plans.id));
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Promo"
        title="Buat promo"
        description="Satu diskon per order: yang paling menguntungkan pembeli. Potongan dihitung dari harga flat, bukan harga coret."
        actions={
          <Button asChild variant="outline" className="h-10 px-4 text-sm font-semibold">
            <Link href="/admin/promos">Kembali ke daftar</Link>
          </Button>
        }
      />
      <PromoForm plans={planRows} />
    </div>
  );
}
