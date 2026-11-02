import { ArrowUpRight, Landmark, Layers, QrCode } from "lucide-react";
import Link from "next/link";
import { DitherPanel } from "@/components/brand/dither-panel";
import { ProviderLogo } from "@/components/brand/provider-logo";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import { formatIdr } from "@/lib/format";
import { cheapestPlan, periodUnit } from "@/lib/plans";
import type { Model, Plan, Provider } from "@/server/catalog/types";
import { CodePanel } from "./code-panel";
import { SessionCta } from "./session-cta";

const PAYMENT_NOTES = [
  { icon: QrCode, label: "QRIS" },
  { icon: Landmark, label: "Virtual Account" },
  { icon: Layers, label: "Satu paket aktif per akun" },
];

export function Hero({ plans, models, providers }: { plans: Plan[]; models: Model[]; providers: Provider[] }) {
  const cheapest = cheapestPlan(plans);
  // First model of up to four different providers, for the example chips.
  const featured = providers.flatMap((p) => models.find((m) => m.providerId === p.id)?.id ?? []).slice(0, 4);
  const pills = providers.slice(0, 4);
  const more = providers.length - pills.length;

  return (
    <section className="container-x grid items-center gap-12 py-12 sm:py-16 lg:min-h-[calc(100svh-7.5rem)] lg:grid-cols-[1.2fr_1.18fr] lg:gap-16 lg:py-20">
      <div>
        {cheapest && (
          <p className="grad-border inline-flex items-center rounded-full px-3.5 py-1.5 font-mono text-[13px] text-fg-soft">
            <span className="font-semibold text-primary-ink">
              Mulai {formatIdr(cheapest.priceIdr)} / {periodUnit(cheapest)}
            </span>
            <span className="ml-2">harga flat</span>
          </p>
        )}
        <h1 className="mt-6 text-[44px] leading-[1.04] font-medium tracking-[-0.04em] text-heading sm:text-[56px] lg:text-[clamp(44px,4.6vw,60px)]">
          <span className="lg:whitespace-nowrap">Satu API key.</span>
          <br />
          <span className="text-grad lg:whitespace-nowrap">Semua model AI.</span>
        </h1>
        <p className="mt-6 max-w-[34rem] text-[17px] leading-[1.65] text-fg-muted sm:text-lg">
          Ganti satu base URL, lalu panggil Claude, GPT, Gemini, DeepSeek, dan model lain. Berlangganan paket berharga
          flat dalam rupiah, bayar dengan QRIS atau Virtual Account.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <SessionCta
            label="Dapatkan API key"
            href={site.links.register}
            icon={<ArrowUpRight className="size-4" aria-hidden />}
            className="h-[52px] min-w-[12.5rem] justify-center px-6 text-base font-semibold"
          />
          <Button asChild variant="outline" className="h-[52px] bg-surface px-6 text-base font-semibold">
            <Link href="/models">Lihat model</Link>
          </Button>
        </div>
        <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-fg-muted">
          {PAYMENT_NOTES.map(({ icon: Icon, label }) => (
            <li key={label} className="inline-flex items-center gap-2">
              <Icon className="size-4 text-faint" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </div>

      <DitherPanel tone="grain" seed={3} className="flex min-h-[560px] flex-col justify-between gap-6 rounded-[20px] p-4 sm:p-8 lg:min-h-[684px] lg:p-11">
        <div className="my-auto">
          <CodePanel apiBaseUrl={site.apiBaseUrl} modelIds={featured} />
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Provider yang tersedia">
          {pills.map((p) => (
            <Link
              key={p.id}
              href="/models"
              className="inline-flex items-center gap-2 rounded-full bg-surface px-3.5 py-2 text-[13px] font-medium text-fg shadow-card"
            >
              <ProviderLogo id={p.id} name={p.name} size={16} />
              {p.name}
            </Link>
          ))}
          {more > 0 && (
            <Link
              href="/models"
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[13px] font-medium text-fg shadow-card"
            >
              {more} lainnya
              <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          )}
        </div>
      </DitherPanel>
    </section>
  );
}
