import type { Metadata } from "next";
import { Suspense } from "react";
import { adminDate, Card, Field, PAGE_SIZE, Pagination, pageParam, param, type SearchParams } from "@/components/admin/common";
import { PageHeader } from "@/components/console/page-header";
import { TableCard } from "@/components/console/table-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdmin } from "@/server/admin";
import { listAudit } from "@/server/domain/admin-orders";

export const metadata: Metadata = { title: "Audit" };

export default function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

/** Compact JSON for a table cell; the full value is in the tooltip. */
function Json({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-faint">-</span>;
  const full = JSON.stringify(value);
  return (
    <code title={full} className="block max-w-72 truncate font-mono text-xs text-fg-soft">
      {full}
    </code>
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

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Pelaku</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Sebelum</TableHead>
              <TableHead>Sesudah</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-fg-muted">
                  Tidak ada catatan.
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ log, email }) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap text-fg-muted">{adminDate.format(log.createdAt)}</TableCell>
                <TableCell className="max-w-40 truncate text-xs">{email ?? log.actorId}</TableCell>
                <TableCell className="font-mono text-xs">{log.action}</TableCell>
                <TableCell className="font-mono text-xs">{log.target ?? "-"}</TableCell>
                <TableCell>
                  <Json value={log.before} />
                </TableCell>
                <TableCell>
                  <Json value={log.after} />
                </TableCell>
                <TableCell className="font-mono text-xs text-fg-muted">{log.ip ?? "-"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      <Pagination basePath="/admin/audit" params={filter} page={page} total={total} />
    </div>
  );
}
