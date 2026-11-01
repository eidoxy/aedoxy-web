"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UsdIdr } from "@/components/usd-idr";
import { site } from "@/config/site";
import { discountPercent, formatIdr, formatUsd } from "@/lib/format";
import { PERIOD_LABEL, periodUnit } from "@/lib/plans";
import { cn } from "@/lib/utils";
import type { FxRate, Plan, PlanPeriod } from "@/server/catalog/types";

const ORDER: PlanPeriod[] = ["weekly", "monthly", "custom"];

function PlanCard({ plan, fx }: { plan: Plan; fx: FxRate | null }) {
  const saving = discountPercent(plan.priceIdr, plan.compareAtPriceIdr);
  const out = plan.stock === "out";
  return (
    <li
      className={cn(
        "flex flex-col rounded-card-lg p-6 shadow-card transition-shadow hover:shadow-card-hover sm:p-7",
        plan.badge ? "grad-border" : "border border-line bg-surface",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-medium tracking-[-0.02em] text-heading">
            {plan.name} {formatUsd(plan.creditUsd)}
          </h3>
          {plan.tagline && <p className="mt-1 text-sm text-fg-muted">{plan.tagline}</p>}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {plan.badge && (
            <span className="rounded-full bg-primary px-2.5 py-1 font-mono text-[10px] font-semibold tracking-wider text-primary-foreground uppercase">
              {plan.badge}
            </span>
          )}
          {plan.stock === "low" && <span className="font-mono text-[11px] text-warn">Stok hampir habis</span>}
        </div>
      </div>

      <div className="mt-6">
        {plan.compareAtPriceIdr !== null && saving !== null && (
          <p className="flex items-center gap-2 font-mono text-sm text-faint">
            <s>
              <span className="sr-only">Harga normal </span>
              {formatIdr(plan.compareAtPriceIdr)}
            </s>
            <span className="rounded bg-primary-tint px-1.5 py-0.5 text-[11px] text-primary-ink">Hemat {saving}%</span>
          </p>
        )}
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[40px] leading-none font-medium tracking-[-0.045em] text-heading">{formatIdr(plan.priceIdr)}</span>
          <span className="font-mono text-xs text-faint">/ {periodUnit(plan)}</span>
        </p>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm text-fg-soft">
          <span>{formatUsd(plan.creditUsd)} kredit</span>
          <UsdIdr usd={plan.creditUsd} fx={fx} />
        </p>
      </div>

      <ul className="mt-6 flex-1 space-y-2.5 border-t border-line pt-5 text-sm text-fg-muted">
        {[
          `Berlaku ${plan.durationDays} hari sejak pembayaran`,
          "Semua model di katalog",
          "Bayar QRIS atau Virtual Account",
          "Sisa kredit hangus setelah masa aktif",
          ...(plan.fairUse ? ["Batas fair use berlaku"] : []),
        ].map((t) => (
          <li key={t} className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
            {t}
          </li>
        ))}
      </ul>

      {out ? (
        <Button disabled className="mt-7 h-11 w-full text-sm font-semibold">
          Stok habis
        </Button>
      ) : (
        <Button asChild className="mt-7 h-11 w-full text-sm font-semibold">
          <Link href={`${site.links.register}?plan=${encodeURIComponent(plan.slug)}`}>
            Pilih paket<span className="sr-only"> {plan.name} {formatUsd(plan.creditUsd)}</span>
          </Link>
        </Button>
      )}
    </li>
  );
}

/** Plan cards grouped by period tab (Mingguan / Bulanan). Prices come from `plans` only. */
export function PlanTabs({ plans, fx, defaultPeriod = "monthly" }: { plans: Plan[]; fx: FxRate | null; defaultPeriod?: PlanPeriod }) {
  const periods = ORDER.filter((p) => plans.some((x) => x.period === p));
  if (periods.length === 0) {
    return <p className="rounded-card border border-line bg-surface p-6 text-fg-muted">Paket belum tersedia. Silakan kembali lagi nanti.</p>;
  }
  const initial = periods.includes(defaultPeriod) ? defaultPeriod : periods[0];
  return (
    <Tabs defaultValue={initial} className="gap-8">
      <TabsList className="h-11 rounded-full border border-line bg-surface p-1">
        {periods.map((p) => (
          <TabsTrigger
            key={p}
            value={p}
            className="h-9 rounded-full px-5 text-sm data-active:bg-primary data-active:text-primary-foreground dark:data-active:bg-primary dark:data-active:text-primary-foreground"
          >
            {PERIOD_LABEL[p]}
          </TabsTrigger>
        ))}
      </TabsList>
      {periods.map((p) => (
        <TabsContent key={p} value={p}>
          <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {plans
              .filter((x) => x.period === p)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((plan) => (
                <PlanCard key={plan.id} plan={plan} fx={fx} />
              ))}
          </ul>
        </TabsContent>
      ))}
    </Tabs>
  );
}
