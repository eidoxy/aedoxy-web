import { Check } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { param, type SearchParams } from "@/components/admin/common";
import { PageHeader } from "@/components/console/page-header";
import { CardsPageSkeleton } from "@/components/console/skeletons";
import { ActivityCard } from "@/components/panel/activity-card";
import { PlanBuyForm } from "@/components/panel/plan-buy-form";
import { PlanGrid } from "@/components/panel/plan-grid";
import { PromoCodeBox } from "@/components/panel/promo-code-box";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FxFootnote, UsdIdr } from "@/components/usd-idr";
import { buildBuySummary, durationLabel } from "@/lib/buy-summary";
import { discountPercent, formatIdr, formatUsd, QUOTA_PER_USD } from "@/lib/format";
import { parsePeriodTab, planCategory } from "@/lib/plan-category";
import { getActivity, getFxRate } from "@/server/catalog";
import { getPendingOrderId } from "@/server/domain/order-view";
import { listOnSalePlans } from "@/server/domain/plan-sellable";
import { getPoolStatus } from "@/server/domain/pool-status";
import { PromoError, quotePlans, rejectionMessage } from "@/server/domain/promotions";
import { getActiveSubscriptionSummary } from "@/server/domain/user-plan";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Paket" };

export default function PlansPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<CardsPageSkeleton />}>
      <Plans searchParams={searchParams} />
    </Suspense>
  );
}

const duration = durationLabel;

async function Plans({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireSession();
  const kode = param((await searchParams).kode)?.slice(0, 64);
  const [onSale, poolStatus, active, pendingOrderId, fx, activity] = await Promise.all([
    // Only plans that exist in New API can be bought (createPlanOrder enforces it too).
    listOnSalePlans(),
    getPoolStatus(),
    getActiveSubscriptionSummary(user.newapiUserId ?? null),
    getPendingOrderId(user.id),
    getFxRate(),
    getActivity(),
  ]);

  // Automatic discounts show without a code; a code from ?kode= is checked again here and again when the order is made.
  let codeNotice: string | null = null;
  let quotes: Awaited<ReturnType<typeof quotePlans>>;
  try {
    quotes = await quotePlans(user.id, onSale, kode);
  } catch (err) {
    if (!(err instanceof PromoError)) throw err;
    codeNotice = err.message;
    quotes = await quotePlans(user.id, onSale);
  }
  const appliedCode = kode && !codeNotice && [...quotes.values()].some((q) => q.codeRejection === null) ? kode : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Paket"
        title="Pilih paket kredit"
        description="Harga flat dalam rupiah, bayar dengan QRIS. Kredit berlaku selama masa aktif paket dan sisanya hangus setelah itu."
        actions={<PromoCodeBox appliedCode={appliedCode} />}
      />
      {codeNotice && (
        <p role="status" className="text-sm text-warn">
          {codeNotice}
        </p>
      )}
      {kode && !appliedCode && !codeNotice && (
        <p role="status" className="text-sm text-warn">
          {rejectionMessage([...quotes.values()][0]?.codeRejection ?? "PROMO_INVALID")}
        </p>
      )}
      {poolStatus === "empty" && (
        <p role="status" className="rounded-xl border border-line bg-alt p-4 text-sm text-fg-soft">
          Stok kredit sedang habis. Paket bisa dibeli lagi setelah stok ditambah.
        </p>
      )}

      {onSale.length === 0 ? (
        <Card>
          <CardContent className="text-sm text-fg-muted">Belum ada paket yang dijual saat ini.</CardContent>
        </Card>
      ) : (
        <PlanGrid
          initialTab={parsePeriodTab(param((await searchParams).periode))}
          items={onSale.map((p) => {
            const soldOut = poolStatus === "empty" || (p.stockLimit !== null && p.soldCount >= p.stockLimit);
            const quote = quotes.get(p.id);
            const promo = quote && quote.choice.promo ? quote.choice : null;
            // With a promotion the flat price is the strike-through; otherwise the admin's optional compare-at price.
            const price = promo ? promo.amountIdr : p.priceIdr;
            const strike = promo ? p.priceIdr : p.compareAtPriceIdr;
            const saving = discountPercent(price, strike);
            const refused = appliedCode && quote?.codeRejection ? rejectionMessage(quote.codeRejection) : null;
            const node = (
              <Card className="w-full gap-0 px-6 py-6">
                <h2 className="text-xl font-medium tracking-[-0.02em] text-heading">{p.name}</h2>
                {p.subtitle && <p className="mt-1 text-sm text-fg-muted">{p.subtitle}</p>}
                <p className="mt-5 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
                  <span className="text-[34px] leading-none font-medium tracking-[-0.045em] text-heading">{formatIdr(price)}</span>
                  <span className="font-mono text-xs text-faint">/ {duration(p)}</span>
                  {saving !== null && strike !== null && (
                    <>
                      <s className="ml-1 text-sm text-faint">{formatIdr(strike)}</s>
                      <span className="rounded-full bg-primary-tint px-2 py-0.5 text-xs font-medium text-primary-ink">Hemat {saving}%</span>
                    </>
                  )}
                  {promo?.promo && <Badge variant="secondary">Promo</Badge>}
                </p>
                {promo?.promo && (
                  <p className="mt-2 text-xs text-fg-muted">
                    Promo {promo.promo.name}: potongan {formatIdr(promo.discountIdr)}
                    {promo.promo.code ? ` (kode ${promo.promo.code})` : ""}. {promo.reason}
                  </p>
                )}
                {refused && <p className="mt-2 text-xs text-warn">{refused}</p>}
                <ul className="mt-5 flex-1 space-y-2 border-t border-line pt-4 text-sm text-fg-muted">
                  <li className="flex items-start gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
                    <span>
                      {formatUsd(p.creditQuota / QUOTA_PER_USD)} kredit <UsdIdr quota={p.creditQuota} fx={fx} />
                    </span>
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
                <PlanBuyForm
                  planId={p.id}
                  fx={fx}
                  disabled={soldOut}
                  promoCode={appliedCode}
                  summary={buildBuySummary({
                    name: p.name,
                    period: p.period,
                    durationUnit: p.durationUnit,
                    durationValue: p.durationValue,
                    creditQuota: p.creditQuota,
                    finalIdr: price,
                    strikeIdr: strike,
                    promo: promo?.promo ? { name: promo.promo.name, code: promo.promo.code, discountIdr: promo.discountIdr } : null,
                    active,
                    pendingOrderId,
                  })}
                />
              </Card>
            );
            return { id: p.id, category: planCategory(p), node };
          })}
        />
      )}
      <ActivityCard initialItems={activity} />
      <FxFootnote fx={fx} />
    </div>
  );
}
