import type { Metadata } from "next";
import { Suspense } from "react";
import { PlanForm } from "@/components/admin/plan-form";
import { PageHeader } from "@/components/console/page-header";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Buat paket" };

export default function NewPlanPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <NewPlan />
    </Suspense>
  );
}

async function NewPlan() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Paket" title="Buat paket" description="Paket baru dikirim ke New API setelah disimpan." />
      <PlanForm values={{ period: "monthly", maxPurchasePerUser: "0" }} enabled sold={false} />
    </div>
  );
}
