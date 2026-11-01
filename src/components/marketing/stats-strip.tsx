import { formatTokens } from "@/lib/format";
import type { Model, Provider, Stats } from "@/server/catalog/types";
import { ProviderLogo } from "@/components/brand/provider-logo";

interface StatBlock {
  label: string;
  value: string;
  note: string;
  chips?: string[];
}

/** Blocks without data are left out, never filled with made-up numbers (UI-GUIDE section 4). */
function buildBlocks(stats: Stats, models: Model[]): StatBlock[] {
  const capabilities = [...new Set(models.flatMap((m) => m.capabilities))];
  const blocks: StatBlock[] = [
    { label: "Model tersedia", value: String(stats.models), note: "dari lab besar dan model terbuka", chips: capabilities },
    { label: "Provider", value: String(stats.providers), note: "dalam satu katalog dan satu API key" },
    { label: "Paket langganan", value: String(stats.plans), note: "harga flat dalam rupiah" },
  ];
  if (stats.tokensProcessed !== undefined) {
    blocks.push({ label: "Token diproses", value: formatTokens(stats.tokensProcessed), note: "dipotong dari kredit paket" });
  }
  if (stats.developers !== undefined) {
    blocks.push({ label: "Developer", value: String(stats.developers), note: "memakai satu API key" });
  }
  return blocks;
}

export function StatsStrip({ stats, models, providers }: { stats: Stats; models: Model[]; providers: Provider[] }) {
  const blocks = buildBlocks(stats, models);
  return (
    <section aria-label="Ringkasan layanan">
      <div className="container-x py-14 sm:py-20">
        <dl
          className="grid grid-cols-2 gap-x-6 gap-y-10 lg:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]"
          style={{ "--cols": blocks.length } as React.CSSProperties}
        >
          {blocks.map((b) => (
            <div key={b.label} className="reveal">
              <dt className="mono-label">{b.label}</dt>
              <dd className="mt-3">
                <span className="block text-[56px] leading-none font-medium tracking-[-0.05em] text-heading sm:text-[72px]">
                  {b.value}
                </span>
                {b.chips && (
                  <span className="mt-4 flex flex-wrap gap-1.5">
                    {b.chips.map((c) => (
                      <span key={c} className="rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-[11px] text-fg-soft">
                        {c}
                      </span>
                    ))}
                  </span>
                )}
                <span className="mt-4 block text-sm text-fg-muted">{b.note}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <ProviderMarquee providers={providers} />
    </section>
  );
}

function ProviderMarquee({ providers }: { providers: Provider[] }) {
  if (providers.length === 0) return null;
  const group = (hidden: boolean) => (
    <ul
      className={`flex shrink-0 items-center gap-12 pr-12 ${hidden ? "marquee-dup" : ""}`}
      aria-hidden={hidden || undefined}
      aria-label={hidden ? undefined : "Provider yang didukung"}
    >
      {providers.map((p) => (
        <li key={p.id} className="flex items-center gap-2.5 text-lg font-medium whitespace-nowrap text-fg-muted">
          <ProviderLogo id={p.id} name={p.name} size={24} />
          {p.name}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="section-rule border-b border-line py-8">
      <div className="marquee">
        <div className="marquee-track">
          {group(false)}
          {group(true)}
        </div>
      </div>
    </div>
  );
}
