import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { adminDate, PageHeader } from "@/components/admin/common";
import { PromoForm, StopPromoForm } from "@/components/admin/promo-forms";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIdr } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { db } from "@/server/db/client";
import { plans } from "@/server/db/schema";
import { listPromos, type PromoStatus } from "@/server/domain/admin-promos";

export const metadata: Metadata = { title: "Promo" };

export default function PromosPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <Promos />
    </Suspense>
  );
}

const STATUS: Record<PromoStatus, { label: string; variant: "default" | "secondary" | "outline" }> = {
  scheduled: { label: "Terjadwal", variant: "outline" },
  active: { label: "Aktif", variant: "default" },
  ended: { label: "Selesai", variant: "secondary" },
};

async function Promos() {
  await requireAdmin();
  const [promos, planRows] = await Promise.all([listPromos(), db.select({ id: plans.id, name: plans.name, priceIdr: plans.priceIdr }).from(plans).orderBy(asc(plans.sortOrder), asc(plans.id))]);
  const planName = new Map(planRows.map((p) => [p.id, p.name]));

  return (
    <div>
      <PageHeader eyebrow="Admin" title="Promo dan diskon" />
      <p className="mt-3 max-w-2xl text-sm text-fg-muted">
        Satu diskon per order: yang paling menguntungkan pembeli. Potongan dihitung dari harga flat, bukan harga coret. Harga akhir dibulatkan ke atas per Rp100 dan tidak kurang dari Rp10.000.
      </p>

      <div className="mt-8 rounded-[18px] border border-line bg-surface p-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Promo</TableHead>
              <TableHead>Diskon</TableHead>
              <TableHead>Paket</TableHead>
              <TableHead>Periode (WIB)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Pemakaian</TableHead>
              <TableHead className="text-right">Total potongan</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {promos.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-fg-muted">
                  Belum ada promo.
                </TableCell>
              </TableRow>
            )}
            {promos.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium text-heading">{p.name}</div>
                  <div className="font-mono text-xs text-faint">{p.code ?? "otomatis"}</div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{p.kind === "percent" ? `${p.value}%` : formatIdr(p.value)}</TableCell>
                <TableCell className="max-w-48 text-fg-muted">{p.planIds.length === 0 ? "Semua paket" : p.planIds.map((id) => planName.get(id) ?? `#${id}`).join(", ")}</TableCell>
                <TableCell className="text-xs whitespace-nowrap text-fg-muted">
                  {p.startsAt ? adminDate.format(p.startsAt) : "langsung"}
                  <br />
                  {p.endsAt ? adminDate.format(p.endsAt) : "tanpa batas"}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS[p.status].variant}>{STATUS[p.status].label}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {p.redeemedCount} / {p.maxRedemptions ?? "∞"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatIdr(p.totalDiscountIdr)}
                  <div className="text-xs text-faint">{p.paidOrders} order lunas</div>
                </TableCell>
                <TableCell>{p.enabled && p.status !== "ended" ? <StopPromoForm promoId={p.id} /> : null}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <h2 className="mt-10 mb-4 text-xl font-medium tracking-[-0.02em] text-heading">Buat promo</h2>
      <PromoForm plans={planRows} />
    </div>
  );
}
