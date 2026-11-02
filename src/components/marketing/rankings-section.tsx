import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { ProviderLogo } from "@/components/brand/provider-logo";
import { formatTokens } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Provider, RankingEntry } from "@/server/catalog/types";

/** Hidden when there is no usage data yet (UI-GUIDE section 7). */
export function RankingsSection({ rankings, providers, brandName }: { rankings: RankingEntry[]; providers: Provider[]; brandName: string }) {
  if (rankings.length === 0) return null;
  const top = rankings.slice(0, 3);
  const max = Math.max(...top.map((r) => r.weeklyTokens), 1);
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? id;

  return (
    <section className="section-rule border-b border-line bg-alt">
      <div className="container-x grid gap-10 py-20 sm:py-28 lg:grid-cols-[1fr_1.5fr] lg:items-center lg:gap-16">
        <div className="reveal">
          <p className="eyebrow">Ranking</p>
          <h2 className="mt-4 text-[34px] leading-[1.1] font-medium tracking-[-0.035em] text-heading sm:text-[44px]">
            Model yang paling banyak
            <br />
            <span className="text-fg-muted">dipakai pekan ini.</span>
          </h2>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-fg-muted">Diurutkan dari volume token pada console {brandName}.</p>
          <Link href="/models" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-ink hover:underline">
            Lihat katalog model
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </div>

        <ol className="space-y-3" aria-label="Tiga model teratas">
          {top.map((r, i) => (
            <li
              key={r.modelId}
              className={cn(
                "reveal grid grid-cols-[2rem_1fr_auto] items-center gap-x-4 gap-y-3 rounded-2xl p-4 sm:grid-cols-[2rem_1fr_9rem_5rem]",
                i === 0 ? "grad-border" : "bg-surface-2/60",
              )}
            >
              <span className="font-mono text-lg text-fg-muted">{i + 1}</span>
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface">
                  <ProviderLogo id={r.providerId} name={providerName(r.providerId)} size={18} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-heading">
                    {r.modelId}
                    {i === 0 && <span className="ml-2 rounded bg-primary-tint px-1.5 py-0.5 font-mono text-[10px] text-primary-ink">TOP</span>}
                  </p>
                  <p className="text-xs text-fg-muted">oleh {providerName(r.providerId)}</p>
                </div>
              </div>
              <div className="col-span-2 col-start-2 sm:col-span-1 sm:col-start-auto">
                <p className="font-mono text-sm text-heading">{formatTokens(r.weeklyTokens)}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
                  <div className={cn("h-full rounded-full", i === 0 ? "bg-primary" : "bg-faint/60")} style={{ width: `${(r.weeklyTokens / max) * 100}%` }} />
                </div>
              </div>
              <span className="justify-self-end row-start-1 col-start-3 sm:row-start-auto sm:col-start-auto">
                {r.isNew ? (
                  <span className="rounded-md bg-primary-tint px-2 py-1 font-mono text-xs text-primary-ink">BARU</span>
                ) : r.changePct !== null ? (
                  <span className="rounded-md bg-primary-tint px-2 py-1 font-mono text-xs text-primary-ink">
                    {r.changePct > 0 ? "+" : ""}
                    {r.changePct}%
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
