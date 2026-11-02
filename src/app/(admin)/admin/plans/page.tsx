import { ArrowDown, ArrowUp, Copy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EnabledDialog, PriceDialog } from "@/components/admin/plan-dialogs";
import { PageHeader } from "@/components/console/page-header";
import { TableCard } from "@/components/console/table-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIdr, formatUsd, QUOTA_PER_USD } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { listAdminPlans } from "@/server/domain/admin-plans";
import { duplicatePlanAction, movePlanAction } from "./actions";

export const metadata: Metadata = { title: "Paket" };

export default function AdminPlansPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <Plans />
    </Suspense>
  );
}

const PERIOD = { weekly: "Mingguan", monthly: "Bulanan" } as const;
const periodLabel = (p: { period: "weekly" | "monthly" | "custom"; durationValue: number; durationUnit: "hour" | "day" }) =>
  p.period === "custom" ? `Kustom ${p.durationValue} ${p.durationUnit === "day" ? "hari" : "jam"}` : PERIOD[p.period];

async function Plans() {
  await requireAdmin();
  const rows = await listAdminPlans();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Paket"
        description="Paket tidak dihapus, hanya dinonaktifkan. Paket yang belum tersinkron ke New API tidak bisa dibeli. Klik harga untuk mengubahnya."
        actions={
          <Button asChild className="h-10 px-4 text-sm font-semibold">
            <Link href="/admin/plans/new">Buat paket</Link>
          </Button>
        }
      />

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Urutan</TableHead>
              <TableHead>Paket</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead className="text-right">Kredit</TableHead>
              <TableHead className="text-right">Harga flat</TableHead>
              <TableHead className="text-right">Harga coret</TableHead>
              <TableHead className="text-right">Terjual</TableHead>
              <TableHead className="text-right">Pendapatan</TableHead>
              <TableHead>Sinkron</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Aksi</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-fg-muted">
                  Belum ada paket.
                </TableCell>
              </TableRow>
            )}
            {rows.map((p, i) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <span className="w-6 font-mono text-xs text-faint">{p.sortOrder}</span>
                    <form action={movePlanAction}>
                      <input type="hidden" name="planId" value={p.id} />
                      <input type="hidden" name="direction" value="up" />
                      <Button type="submit" variant="ghost" size="icon-xs" disabled={i === 0} aria-label={`Naikkan ${p.name}`}>
                        <ArrowUp />
                      </Button>
                    </form>
                    <form action={movePlanAction}>
                      <input type="hidden" name="planId" value={p.id} />
                      <input type="hidden" name="direction" value="down" />
                      <Button type="submit" variant="ghost" size="icon-xs" disabled={i === rows.length - 1} aria-label={`Turunkan ${p.name}`}>
                        <ArrowDown />
                      </Button>
                    </form>
                  </div>
                </TableCell>
                <TableCell>
                  <Link href={`/admin/plans/${p.id}`} className="font-medium text-heading underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                  {p.badge && (
                    <Badge variant="secondary" className="ml-2">
                      {p.badge}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-fg-muted">{periodLabel(p)}</TableCell>
                <TableCell className="text-right font-mono">{formatUsd(p.creditQuota / QUOTA_PER_USD)}</TableCell>
                <TableCell className="text-right">
                  <PriceDialog planId={p.id} name={p.name} priceIdr={p.priceIdr} />
                </TableCell>
                <TableCell className="text-right font-mono text-fg-muted">{p.compareAtPriceIdr ? formatIdr(p.compareAtPriceIdr) : "-"}</TableCell>
                <TableCell className="text-right font-mono">
                  {p.paidCount}
                  {p.stockLimit !== null && <span className="text-faint"> / {p.stockLimit}</span>}
                </TableCell>
                <TableCell className="text-right font-mono">{formatIdr(p.revenueIdr)}</TableCell>
                <TableCell>{p.synced ? <Badge variant="default">Tersinkron</Badge> : <Badge variant="destructive">Belum tersinkron</Badge>}</TableCell>
                <TableCell>{p.enabled ? <Badge variant="outline">Aktif</Badge> : <Badge variant="secondary">Nonaktif</Badge>}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/admin/plans/${p.id}`}>Ubah</Link>
                    </Button>
                    <EnabledDialog planId={p.id} name={p.name} enabled={p.enabled} />
                    <form action={duplicatePlanAction}>
                      <input type="hidden" name="planId" value={p.id} />
                      <Button type="submit" variant="ghost" size="icon-sm" aria-label={`Duplikat ${p.name}`}>
                        <Copy />
                      </Button>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      <p className="text-xs text-faint">&ldquo;Terjual&rdquo; = order lunas (dan stok paket bila ada). Pendapatan = jumlah order lunas, tanpa memperhitungkan refund.</p>
    </div>
  );
}
