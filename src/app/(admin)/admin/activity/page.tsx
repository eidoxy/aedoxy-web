import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ActivitySettingsForm, HideItemForm } from "@/components/admin/activity-forms";
import { adminDate, Card, PageHeader } from "@/components/admin/common";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <div>
      <PageHeader eyebrow="Admin" title="Feed aktivitas" />
      <p className="mt-3 max-w-2xl text-sm text-fg-muted">
        Hanya pembelian paket yang berhasil diaktifkan, satu item per pengguna, 7 hari terakhir. Pengguna yang menonaktifkan aktivitasnya tidak ikut.
        Feed disembunyikan sepenuhnya bila item kurang dari 3.
      </p>

      <div className="mt-8">
        <ActivitySettingsForm enabled={settings.enabled} plans={planRows} allowedIds={settings.planIds} />
      </div>

      <h2 className="mt-10 text-xl font-medium tracking-[-0.02em] text-heading">Item aktif</h2>
      {!settings.enabled ? (
        <p className="mt-2 text-sm text-warn">Feed dimatikan, pengunjung tidak melihat item apa pun.</p>
      ) : !feedVisible ? (
        <p className="mt-2 text-sm text-warn">Item kurang dari 3, feed tidak tampil di situs.</p>
      ) : null}
      <Card className="mt-4 p-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tampil sebagai</TableHead>
              <TableHead>Paket</TableHead>
              <TableHead>Waktu</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-fg-muted">
                  Belum ada item.
                </TableCell>
              </TableRow>
            )}
            {items.map((i) => (
              <TableRow key={i.orderId}>
                <TableCell className="font-mono text-sm">{i.label}</TableCell>
                <TableCell>{i.plan}</TableCell>
                <TableCell className="whitespace-nowrap text-fg-muted">{adminDate.format(new Date(i.at))}</TableCell>
                <TableCell>
                  <HideItemForm orderId={i.orderId} label={i.label} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="mt-3 text-xs text-faint">{settings.hiddenOrderIds.length} item disembunyikan. Perubahan tampil di situs dalam sekitar 30 detik.</p>
    </div>
  );
}
