import type { Metadata } from "next";
import { Suspense } from "react";
import { adminDate, Card, Field, NativeSelect, PAGE_SIZE, Pagination, pageParam, param, Stat, type SearchParams } from "@/components/admin/common";
import { AdjustPoolForm, ThresholdForm } from "@/components/admin/pool-forms";
import { PageHeader } from "@/components/console/page-header";
import { TableCard } from "@/components/console/table-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UsdIdr } from "@/components/usd-idr";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatUsd, QUOTA_PER_USD } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getFxRate } from "@/server/catalog";
import { getPoolOverview, LEDGER_TYPES, listLedger } from "@/server/domain/admin-pool";
import { DEFAULT_LOW_THRESHOLD_QUOTA } from "@/server/domain/pool-status";

export const metadata: Metadata = { title: "Pool" };

export default function PoolPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <Pool searchParams={searchParams} />
    </Suspense>
  );
}

const num = new Intl.NumberFormat("id-ID");
const usd = (quota: number) => formatUsd(quota / QUOTA_PER_USD);
const both = (quota: number) => `${usd(quota)} (${num.format(quota)} kuota)`;

async function Pool({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const filter = { type: param(sp.type), from: param(sp.from), to: param(sp.to) };
  const page = pageParam(sp.page);
  const [overview, ledger, fx] = await Promise.all([getPoolOverview(), listLedger(filter, page, PAGE_SIZE), getFxRate()]);

  const exportQuery = new URLSearchParams(Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1]))).toString();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Pool kredit"
        description="Stok kredit yang dijual ke pembeli. Perubahan stok dicatat di ledger di bawah."
        actions={
          <Button asChild variant="outline" className="h-9 px-4 text-sm font-semibold">
            <a href={`/admin/pool/export${exportQuery ? `?${exportQuery}` : ""}`} download>
              Ekspor CSV
            </a>
          </Button>
        }
      />

      {!overview ? (
        <Card>
          <p className="text-sm text-fg-muted">Pool belum dibuat. Jalankan <code className="font-mono">bun run db:seed-catalog</code> sekali, lalu muat ulang halaman ini.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Stat label="Tersedia" value={usd(overview.available)} hint={<>{both(overview.available)} <UsdIdr quota={overview.available} fx={fx} /></>} tone={overview.available < 0 ? "danger" : undefined} />
            <Stat label="Total" value={usd(overview.total)} hint={<>{both(overview.total)} <UsdIdr quota={overview.total} fx={fx} /></>} />
            <Stat label="Terjual" value={usd(overview.sold)} hint={both(overview.sold)} />
            <Stat label="Direservasi" value={usd(overview.reserved)} hint={`${both(overview.reserved)} · order menunggu bayar`} />
            <Stat label="Terpakai" value={`${overview.usedPct}%`} hint="(terjual + direservasi) / total" />
            <Stat
              label="Invarian pool"
              value={!overview.invariant ? "-" : overview.invariant.ok ? "Cocok" : `Selisih ${num.format(diff(overview.invariant))}`}
              tone={overview.invariant && !overview.invariant.ok ? "danger" : "success"}
              hint={overview.invariant?.ok === false ? "Kolom pool tidak sama dengan ledger. Periksa sebelum mengubah stok." : "Kolom pool sama dengan jumlah ledger"}
            />
          </div>

          <AdjustPoolForm />
          <ThresholdForm currentUsd={overview.lowThreshold / QUOTA_PER_USD} />
          <p className="text-xs text-faint">Ambang yang berlaku sekarang: {usd(overview.lowThreshold > 0 ? overview.lowThreshold : DEFAULT_LOW_THRESHOLD_QUOTA)}.</p>
        </>
      )}

      <h2 className="pt-4 text-xl font-medium tracking-[-0.02em] text-heading">Ledger</h2>
      <form method="get" className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Field label="Tipe" htmlFor="type">
          <NativeSelect id="type" name="type" defaultValue={filter.type ?? ""}>
            <option value="">Semua</option>
            {LEDGER_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Dari (WIB)" htmlFor="from">
          <Input id="from" name="from" type="date" defaultValue={filter.from ?? ""} className="h-9 bg-background" />
        </Field>
        <Field label="Sampai (WIB)" htmlFor="to">
          <Input id="to" name="to" type="date" defaultValue={filter.to ?? ""} className="h-9 bg-background" />
        </Field>
        <div className="flex gap-2">
          <Button type="submit" className="h-9 px-4 text-sm font-semibold">
            Terapkan
          </Button>
        </div>
      </form>

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Tipe</TableHead>
              <TableHead className="text-right">Perubahan</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Oleh</TableHead>
              <TableHead>Catatan</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ledger.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-fg-muted">
                  Tidak ada baris.
                </TableCell>
              </TableRow>
            )}
            {ledger.rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-fg-muted">{adminDate.format(r.createdAt)}</TableCell>
                <TableCell className="font-mono text-xs">{r.type}</TableCell>
                <TableCell className="text-right font-mono">
                  {r.delta > 0 ? "+" : ""}
                  {usd(r.delta)}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.tradeNo ?? "-"}</TableCell>
                <TableCell className="max-w-32 truncate font-mono text-xs">{r.actorId ?? "-"}</TableCell>
                <TableCell className="max-w-64 truncate text-fg-muted">{r.note ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
      <Pagination basePath="/admin/pool" params={filter} page={page} total={ledger.total} />
    </div>
  );
}

function diff(inv: NonNullable<Awaited<ReturnType<typeof getPoolOverview>>>["invariant"] & object) {
  return Math.abs(inv.pool.total - inv.ledger.total) + Math.abs(inv.pool.reserved - inv.ledger.reserved) + Math.abs(inv.pool.sold - inv.ledger.sold);
}
