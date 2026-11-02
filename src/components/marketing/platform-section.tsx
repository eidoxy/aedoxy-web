import { Layers, QrCode, ShieldCheck, Wallet } from "lucide-react";
import Link from "next/link";
import { DitherPanel } from "@/components/brand/dither-panel";
import { ProviderLogo } from "@/components/brand/provider-logo";
import { UsdIdr } from "@/components/usd-idr";
import { formatIdr, formatUsd } from "@/lib/format";
import { periodUnit } from "@/lib/plans";
import { cn } from "@/lib/utils";
import type { FxRate, Model, Plan, Provider } from "@/server/catalog/types";

function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("reveal overflow-hidden rounded-card-lg border border-line bg-surface shadow-card transition-shadow hover:shadow-card-hover", className)}>
      {children}
    </div>
  );
}

function CardCopy({ icon: Icon, title, children }: { icon: typeof Layers; title: string; children: React.ReactNode }) {
  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-lg bg-primary-tint text-primary-ink">
          <Icon className="size-4" aria-hidden />
        </span>
        <h3 className="text-lg font-medium tracking-[-0.01em] text-heading">{title}</h3>
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">{children}</p>
    </div>
  );
}

const kindOf = (m: Model) => (m.capabilities.includes("reasoning") ? "REASONING" : m.capabilities.includes("image") ? "VISION" : "CHAT");

export function PlatformSection({
  models,
  providers,
  plan,
  fx,
  brandName,
}: {
  brandName: string;
  models: Model[];
  providers: Provider[];
  plan: Plan | null;
  fx: FxRate | null;
}) {
  const sample = providers.flatMap((p) => models.find((m) => m.providerId === p.id) ?? []).slice(0, 4);

  return (
    <section className="section-rule">
      <div className="container-x py-20 sm:py-28">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
          <div className="reveal">
            <p className="eyebrow">Platform</p>
            <h2 className="mt-4 text-[34px] leading-[1.08] font-medium tracking-[-0.035em] text-heading sm:text-5xl">
              Satu pintu masuk.
              <br />
              <span className="text-fg-muted">Banyak model di belakangnya.</span>
            </h2>
          </div>
          <p className="reveal max-w-md text-[17px] leading-[1.65] text-fg-muted lg:justify-self-end">
            {brandName} meneruskan request Anda ke provider yang tepat dan memotong kredit dari satu paket aktif. Tidak ada akun
            atau tagihan terpisah untuk tiap provider.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
          <Card>
            <DitherPanel seed={11} className="h-[250px] px-5 pt-6 sm:px-8">
              <ul className="space-y-2.5">
                {sample.map((m) => (
                  <li key={m.id} className="flex h-11 items-center gap-3 rounded-xl bg-surface px-4 shadow-card">
                    <ProviderLogo id={m.providerId} name={m.providerId} size={18} />
                    <span className="font-mono text-sm text-fg">{m.id}</span>
                    <span className="ml-auto font-mono text-[10px] tracking-wider text-faint">{kindOf(m)}</span>
                  </li>
                ))}
              </ul>
              <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-surface to-transparent" />
            </DitherPanel>
            <CardCopy icon={Layers} title="Satu katalog, dua format">
              Panggil model dengan format OpenAI Chat Completions atau Anthropic Messages, sesuai yang sudah dipakai kode Anda.
            </CardCopy>
          </Card>

          {plan && (
            <Card>
              <div className="p-6 sm:p-8">
                <div className="rounded-xl border border-line bg-surface-2 p-5">
                  <p className="mono-label">Contoh paket aktif</p>
                  <dl className="mt-3 divide-y divide-line text-sm">
                    <Row term="Paket" detail={`${plan.name} · ${formatUsd(plan.creditUsd)} kredit`} />
                    <Row term="Harga flat" detail={formatIdr(plan.priceIdr)} />
                    <Row
                      term="Kredit"
                      detail={
                        <span className="flex flex-col items-end">
                          {formatUsd(plan.creditUsd)}
                          <UsdIdr usd={plan.creditUsd} fx={fx} />
                        </span>
                      }
                    />
                    <Row term="Masa aktif" detail={`${plan.durationDays} hari`} />
                    <Row term="Sisa kredit" detail="hangus di akhir masa aktif" />
                  </dl>
                </div>
              </div>
              <CardCopy icon={Wallet} title="Satu paket, semua provider">
                Semua model memotong kredit dari paket yang sama. Satu akun hanya punya satu paket aktif.
              </CardCopy>
            </Card>
          )}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1.5fr]">
          {plan && (
            <Card className="flex flex-col">
              <div className="flex-1 p-6 sm:p-8">
                <p className="mono-label">Bayar sekali per periode</p>
                <p className="mt-4 text-5xl leading-none font-medium tracking-[-0.045em] text-heading">{formatIdr(plan.priceIdr)}</p>
                <p className="mt-2 font-mono text-xs text-faint">/ {periodUnit(plan)} · {formatUsd(plan.creditUsd)} kredit</p>
                <ul className="mt-6 flex flex-wrap gap-2 text-xs">
                  {["QRIS", "Virtual Account"].map((m) => (
                    <li key={m} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 font-mono text-fg-soft">
                      <QrCode className="size-3.5" aria-hidden />
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
              <CardCopy icon={Wallet} title="Harga flat dalam rupiah">
                Yang Anda bayar adalah harga paket, bukan hasil hitung kurs. Estimasi rupiah dari kredit dolar hanya keterangan.
              </CardCopy>
            </Card>
          )}

          <Card className={plan ? undefined : "lg:col-span-2"}>
            <div className="p-6 sm:p-8">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  ["Dalam transit", "HTTPS"],
                  ["Sisa kredit", "Hangus di akhir"],
                  ["Paket aktif", "Satu per akun"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-line p-4">
                    <p className="mono-label">{k}</p>
                    <p className="mt-2 text-xl font-medium tracking-[-0.02em] text-heading">{v}</p>
                  </div>
                ))}
              </div>
              <ol aria-label="Alur request" className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line p-3 font-mono text-xs text-fg-soft">
                {["Aplikasi Anda", "HTTPS", brandName, "Provider"].map((step, i, all) => (
                  <li key={step} className="flex items-center gap-2">
                    <span className={cn("rounded-md border px-2.5 py-1.5", i === 2 ? "border-primary-ink/40 bg-primary-tint text-primary-ink" : "border-line bg-surface-2")}>
                      {step}
                    </span>
                    {i < all.length - 1 && <span aria-hidden className="text-faint">→</span>}
                  </li>
                ))}
              </ol>
            </div>
            {/* TODO(owner): state prompt-retention facts here once confirmed; only HTTPS is claimed for now. */}
            <CardCopy icon={ShieldCheck} title="Alur request yang sederhana">
              Request dikirim lewat HTTPS ke gateway {brandName}, lalu diteruskan ke provider model.{" "}
              <Link href="/privacy" className="text-primary-ink underline underline-offset-2">
                Baca Kebijakan Privasi
              </Link>
              .
            </CardCopy>
          </Card>
        </div>
      </div>
    </section>
  );
}

function Row({ term, detail }: { term: string; detail: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-fg-muted">{term}</dt>
      <dd className="text-right font-medium text-fg">{detail}</dd>
    </div>
  );
}
