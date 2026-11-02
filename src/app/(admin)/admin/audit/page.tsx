import type { Metadata } from "next";
import { Suspense } from "react";
import { AuditTable } from "@/components/admin/audit-table";
import { Card, Field, PAGE_SIZE, Pagination, pageParam, param, type SearchParams } from "@/components/admin/common";
import { PageHeader } from "@/components/console/page-header";
import { TablePageSkeleton } from "@/components/console/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/server/admin";
import { listAudit } from "@/server/domain/admin-orders";

export const metadata: Metadata = { title: "Audit" };

export default function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<TablePageSkeleton filters cols={7} />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = { action: param(sp.action), actor: param(sp.actor) };
  const page = pageParam(sp.page);
  const { rows, total } = await listAudit(filter, page, PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Audit" description="Catatan aksi admin: siapa mengubah apa, nilai sebelum dan sesudahnya." />
      <Card>
      <form method="get" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Aksi (awalan)" htmlFor="action" hint="Contoh: plan, pool.adjust, fulfillment.">
          <Input id="action" name="action" defaultValue={filter.action ?? ""} maxLength={60} className="h-9 bg-background" />
        </Field>
        <Field label="Pelaku (id atau email)" htmlFor="actor">
          <Input id="actor" name="actor" defaultValue={filter.actor ?? ""} maxLength={100} className="h-9 bg-background" />
        </Field>
        <Button type="submit" className="mb-5 h-9 px-4 text-sm font-semibold">
          Terapkan
        </Button>
      </form>
      </Card>

      <AuditTable rows={rows.map(({ log, email }) => ({ id: log.id, createdAt: log.createdAt.toISOString(), actor: email ?? log.actorId, action: log.action, target: log.target, before: log.before, after: log.after, ip: log.ip }))} />
      <Pagination basePath="/admin/audit" params={filter} page={page} total={total} />
    </div>
  );
}
