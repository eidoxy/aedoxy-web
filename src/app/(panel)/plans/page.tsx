import { Check } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { param, type SearchParams } from "@/components/admin/common";
import { PlanBuyForm } from "@/components/panel/plan-buy-form";
import { PromoCodeBox } from "@/components/panel/promo-code-box";
import { FxFootnote, UsdIdr } from "@/components/usd-idr";
import { discountPercent, formatIdr, formatUsd, QUOTA_PER_USD } from "@/lib/format";
import { getFxRate } from "@/server/catalog";
import { listOnSalePlans } from "@/server/domain/plan-sellable";
import { getPoolStatus } from "@/server/domain/pool-status";
import { PromoError, quotePlans, rejectionMessage } from "@/server/domain/promotions";
import { listActiveSubscriptions } from "@/server/integrations/newapi";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Paket" };

export default function PlansPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <Plans searchParams={searchParams} />
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

async function Plans({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await requireSession();
  const kode = param((await searchParams).kode)?.slice(0, 64);
  const [onSale, poolStatus, hasActive, fx] = await Promise.all([
    // Only plans that exist in New API can be bought (createPlanOrder enforces it too).
    listOnSalePlans(),
    getPoolStatus(),
    hasActivePlan(user.newapiUserId ?? null),
    getFxRate(),
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
    <div>
      <p className="eyebrow">Paket</p>
      <h1 className="mt-3 text-4xl font-medium tracking-[-0.04em] text-heading">Pilih paket kredit</h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-fg-muted">
        Harga flat dalam rupiah, bayar dengan QRIS. Kredit berlaku selama masa aktif paket dan sisanya hangus setelah itu.
      </p>
      <PromoCodeBox appliedCode={appliedCode} />
      {codeNotice && (
        <p role="status" className="mt-2 text-sm text-warn">
          {codeNotice}
        </p>
      )}
      {kode && !appliedCode && !codeNotice && (
        <p role="status" className="mt-2 text-sm text-warn">
          {rejectionMessage([...quotes.values()][0]?.codeRejection ?? "PROMO_INVALID")}
        </p>
      )}
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
            const quote = quotes.get(p.id);
            const promo = quote && quote.choice.promo ? quote.choice : null;
            // With a promotion the flat price is the strike-through; otherwise the admin's optional compare-at price.
            const price = promo ? promo.amountIdr : p.priceIdr;
            const strike = promo ? p.priceIdr : p.compareAtPriceIdr;
            const saving = discountPercent(price, strike);
            const refused = appliedCode && quote?.codeRejection ? rejectionMessage(quote.codeRejection) : null;
            return (
              <li key={p.id} className="flex flex-col rounded-[18px] border border-line bg-surface p-6 shadow-[0_1px_3px_rgba(0,0,0,.04),0_1px_2px_rgba(0,0,0,.02)]">
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
                <PlanBuyForm planId={p.id} planName={p.name} hasActive={hasActive} disabled={soldOut} promoCode={appliedCode} />
              </li>
            );
          })}
        </ul>
      )}
      <FxFootnote fx={fx} className="mt-6" />
    </div>
  );
}
