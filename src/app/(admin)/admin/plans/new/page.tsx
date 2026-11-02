import type { Metadata } from "next";
import { Suspense } from "react";
import { PlanForm } from "@/components/admin/plan-form";
import { PageHeader } from "@/components/console/page-header";
import { FormPageSkeleton } from "@/components/console/skeletons";
import { requireAdmin } from "@/server/admin";
import { listGroups } from "@/server/integrations/newapi";

export const metadata: Metadata = { title: "Buat paket" };

export default function NewPlanPage() {
  return (
    <Suspense fallback={<FormPageSkeleton fields={6} />}>
      <NewPlan />
    </Suspense>
  );
}

async function NewPlan() {
  await requireAdmin();
  const groups = await listGroups().catch(() => null);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Paket" title="Buat paket" description="Paket baru dikirim ke New API setelah disimpan." />
      <PlanForm values={{ period: "monthly", maxPurchasePerUser: "0" }} enabled sold={false} groups={groups} />
    </div>
  );
}
