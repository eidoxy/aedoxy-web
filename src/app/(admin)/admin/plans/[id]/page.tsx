import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Stat } from "@/components/admin/common";
import { PlanForm } from "@/components/admin/plan-form";
import { PageHeader } from "@/components/console/page-header";
import { FormPageSkeleton } from "@/components/console/skeletons";
import { formatIdr } from "@/lib/format";
import { planToFormValues } from "@/lib/schemas/plan";
import { requireAdmin } from "@/server/admin";
import { getAdminPlan } from "@/server/domain/admin-plans";

export const metadata: Metadata = { title: "Ubah paket" };

export default function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<FormPageSkeleton fields={6} />}>
      <EditPlan params={params} />
    </Suspense>
  );
}

async function EditPlan({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const planId = /^\d{1,9}$/.test(id) ? Number(id) : NaN;
  const plan = Number.isSafeInteger(planId) ? await getAdminPlan(planId) : null;
  if (!plan) notFound();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Paket" title={plan.name} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Terjual (lunas)" value={plan.paidCount} />
        <Stat label="Pendapatan" value={formatIdr(plan.revenueIdr)} />
        <Stat label="Sinkron" value={plan.synced ? "Ya" : "Belum"} tone={plan.synced ? "success" : "danger"} hint={plan.newapiPlanId ? `ID New API ${plan.newapiPlanId}` : "Belum ada di New API"} />
      </div>
      <PlanForm planId={plan.id} values={planToFormValues(plan)} enabled={plan.enabled} sold={plan.paidCount > 0} />
    </div>
  );
}
