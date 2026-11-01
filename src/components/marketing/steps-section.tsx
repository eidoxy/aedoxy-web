import { Check, Mail } from "lucide-react";
import { formatIdr, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Plan } from "@/server/catalog/types";

/** The demo cards are illustrations: inert and hidden from assistive tech. */
export function StepsSection({ plan }: { plan: Plan | null }) {
  const steps = [
    {
      title: "Daftar akun",
      text: "Daftar dengan email dan password atau akun Google. Satu akun berlaku untuk situs dan console API.",
      chip: "daftar",
      demo: (
        <div className="space-y-2.5">
          <div className="flex h-10 items-center justify-center gap-2 rounded-lg border border-line-strong text-sm font-semibold text-heading">
            <Mail className="size-4" aria-hidden /> Lanjut dengan email
          </div>
          <div className="flex h-10 items-center justify-center rounded-lg border border-line-strong text-sm font-semibold text-heading">
            Lanjut dengan Google
          </div>
          <p className="pt-1 text-center font-mono text-[11px] text-faint">satu akun · dua layanan</p>
        </div>
      ),
    },
    {
      title: "Pilih paket dan bayar",
      text: "Pilih paket mingguan atau bulanan, lalu bayar dengan QRIS atau Virtual Account. Kredit masuk setelah pembayaran terkonfirmasi.",
      chip: "bayar",
      demo: (
        <div>
          <div className="flex gap-2 font-mono text-[11px]">
            <span className="rounded-md border border-primary-ink/30 bg-primary-tint px-2 py-1 text-primary-ink">QRIS</span>
            <span className="rounded-md border border-line px-2 py-1 text-fg-soft">Virtual Account</span>
          </div>
          {plan && (
            <>
              <p className="mt-4 text-3xl font-medium tracking-[-0.03em] text-heading">{formatIdr(plan.priceIdr)}</p>
              <p className="mt-1 font-mono text-[11px] text-faint">
                Contoh · {plan.name} {formatUsd(plan.creditUsd)}
              </p>
            </>
          )}
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-tint px-2.5 py-1 font-mono text-[11px] text-primary-ink">
            <Check className="size-3" aria-hidden /> kredit aktif
          </p>
        </div>
      ),
    },
    {
      title: "Buat API key",
      text: "Buka console, buat key, tempel ke SDK atau agen Anda, lalu kirim request pertama.",
      chip: "pakai",
      highlight: true,
      demo: (
        <div>
          <p className="mono-label">AEDOXY_API_KEY</p>
          <div className="mt-2 flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2.5 font-mono text-sm text-fg">
            <span>sk-••••••••••••</span>
            <span className="rounded bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">Salin</span>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section className="section-rule">
      <div className="container-x py-20 sm:py-28">
        <div className="reveal">
          <p className="eyebrow">Mulai</p>
          <h2 className="mt-4 text-[34px] leading-[1.08] font-medium tracking-[-0.035em] text-heading sm:text-5xl">
            Dari nol ke API key
            <br />
            <span className="text-fg-muted">dalam tiga langkah.</span>
          </h2>
        </div>

        <ol className="mt-14 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {steps.map((s, i) => (
            <li key={s.title} className="reveal">
              <div className="flex items-center gap-3" aria-hidden>
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full border font-mono text-xs",
                    s.highlight ? "border-primary bg-primary text-primary-foreground" : "border-primary-ink/30 bg-primary-tint text-primary-ink",
                  )}
                >
                  {i + 1}
                </span>
                <span className="h-px flex-1 bg-primary-ink/30" />
                <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[11px] text-fg-muted">{s.chip}</span>
              </div>
              <h3 className="mt-6 text-[22px] font-medium tracking-[-0.02em] text-heading">
                <span className="sr-only">Langkah {i + 1}: </span>
                {s.title}
              </h3>
              <p className="mt-2 min-h-[4.5rem] text-[15px] leading-relaxed text-fg-muted">{s.text}</p>
              <div
                aria-hidden
                inert
                className={cn(
                  "mt-6 rounded-card-lg p-5 sm:p-6",
                  s.highlight ? "grad-border" : "border border-line bg-surface shadow-card",
                )}
              >
                {s.demo}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
