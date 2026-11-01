import { and, asc, eq, isNotNull } from "drizzle-orm";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PlanBuyForm } from "@/components/panel/plan-buy-form";
import { formatIdr, formatUsd, QUOTA_PER_USD } from "@/lib/format";
import { db } from "@/server/db/client";
import { plans } from "@/server/db/schema";
import { getPoolStatus } from "@/server/domain/pool-status";
import { listActiveSubscriptions } from "@/server/integrations/newapi";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Paket" };

export default function PlansPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <Plans />
    </Suspense>
  );
}

const duration = (p: { durationUnit: "hour" | "day"; durationValue: number }) => `${p.durationValue} ${p.durationUnit === "day" ? "hari" : "jam"}`;

async function hasActivePlan(newapiUserId: number | null) {
  if (newapiUserId == null) return false;
  try {
    return (await listActiveSubscriptions(newapiUserId)).length > 0;
  } catch {
    // Console unreachable: the server asks for the confirmation itself if it turns out to be needed.
    return false;
  }
}

async function Plans() {
  const { user } = await requireSession();
  const now = new Date();
  const [rows, poolStatus, hasActive] = await Promise.all([
    // Only plans that exist in New API can be bought (createPlanOrder enforces it too).
    db.select().from(plans).where(and(eq(plans.enabled, true), isNotNull(plans.newapiPlanId))).orderBy(asc(plans.sortOrder), asc(plans.id)),
    getPoolStatus(),
    hasActivePlan(user.newapiUserId ?? null),
  ]);
  const onSale = rows.filter((p) => (!p.saleStartsAt || p.saleStartsAt <= now) && (!p.saleEndsAt || p.saleEndsAt > now));

  return (
    <div>
      <p className="eyebrow">Paket</p>
      <h1 className="mt-3 text-4xl font-medium tracking-[-0.04em] text-heading">Pilih paket kredit</h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted">
        Harga flat dalam rupiah, bayar dengan QRIS. Kredit berlaku selama masa aktif paket dan sisanya hangus setelah itu.
      </p>
      {poolStatus === "empty" && (
        <p role="status" className="mt-6 rounded-xl border border-line bg-alt p-4 text-sm text-fg-soft">
          Stok kredit sedang habis. Paket bisa dibeli lagi setelah stok ditambah.
        </p>
      )}

      {onSale.length === 0 ? (
        <p className="mt-8 rounded-[18px] border border-line bg-surface p-6 text-sm text-fg-muted">Belum ada paket yang dijual saat ini.</p>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {onSale.map((p) => {
            const soldOut = poolStatus === "empty" || (p.stockLimit !== null && p.soldCount >= p.stockLimit);
            return (
              <li key={p.id} className="flex flex-col rounded-[18px] border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.04),0_1px_2px_rgba(0,0,0,.02)]">
                <h2 className="text-xl font-medium tracking-[-0.02em] text-heading">{p.name}</h2>
                {p.subtitle && <p className="mt-1 text-sm text-fg-muted">{p.subtitle}</p>}
                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="text-[34px] leading-none font-medium tracking-[-0.045em] text-heading">{formatIdr(p.priceIdr)}</span>
                  <span className="font-mono text-xs text-faint">/ {duration(p)}</span>
                </p>
                <ul className="mt-5 flex-1 space-y-2 border-t border-line pt-4 text-sm text-fg-muted">
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
                    {formatUsd(p.creditQuota / QUOTA_PER_USD)} kredit
                  </li>
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
                    Berlaku {duration(p)} sejak pembayaran
                  </li>
                  {p.fairUse && (
                    <li className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
                      Batas fair use berlaku
                    </li>
                  )}
                </ul>
                <PlanBuyForm planId={p.id} planName={p.name} hasActive={hasActive} disabled={soldOut} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
