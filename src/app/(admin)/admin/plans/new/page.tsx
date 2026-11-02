import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/admin/common";
import { PlanForm } from "@/components/admin/plan-form";
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
    <div>
      <PageHeader eyebrow="Paket" title="Buat paket" />
      <div className="mt-8 max-w-3xl">
        <PlanForm values={{ period: "monthly", maxPurchasePerUser: "0" }} enabled sold={false} />
      </div>
    </div>
  );
}
