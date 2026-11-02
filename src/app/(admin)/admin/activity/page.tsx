import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivitySettingsForm } from "@/components/admin/activity-forms";
import { ActivityTable } from "@/components/admin/activity-table";
import { PageHeader } from "@/components/console/page-header";
import { requireAdmin } from "@/server/admin";
import { db } from "@/server/db/client";
import { plans } from "@/server/db/schema";
import { listAdminActivity } from "@/server/domain/activity";

export const metadata: Metadata = { title: "Aktivitas" };

export default function ActivityAdminPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <Activity />
    </Suspense>
  );
}

async function Activity() {
  await requireAdmin();
  const [{ settings, items, feedVisible }, planRows] = await Promise.all([
    listAdminActivity(),
    db.select({ id: plans.id, name: plans.name }).from(plans).orderBy(asc(plans.sortOrder), asc(plans.id)),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Feed aktivitas"
        description="Hanya pembelian paket yang berhasil diaktifkan, satu item per pengguna, 7 hari terakhir. Pengguna yang menonaktifkan aktivitasnya tidak ikut. Feed disembunyikan sepenuhnya bila item kurang dari 3."
      />

      <ActivitySettingsForm enabled={settings.enabled} plans={planRows} allowedIds={settings.planIds} />

      <div>
        <h2 className="text-xl font-medium tracking-[-0.02em] text-heading">Item aktif</h2>
        {!settings.enabled ? (
          <p className="mt-2 text-sm text-warn">Feed dimatikan, pengunjung tidak melihat item apa pun.</p>
        ) : !feedVisible ? (
          <p className="mt-2 text-sm text-warn">Item kurang dari 3, feed tidak tampil di situs.</p>
        ) : null}
      </div>
      <ActivityTable rows={items} />
      <p className="text-xs text-faint">{settings.hiddenOrderIds.length} item disembunyikan. Perubahan tampil di situs dalam sekitar 30 detik.</p>
    </div>
  );
}
