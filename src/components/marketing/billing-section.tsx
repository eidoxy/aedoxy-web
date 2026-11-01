import { ArrowUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { UsdIdr } from "@/components/usd-idr";
import { site } from "@/config/site";
import { formatIdr, formatUsd } from "@/lib/format";
import type { FxRate, Plan } from "@/server/catalog/types";

const STEPS = [
  { title: "Beli paket", tag: "FLAT", text: "Pilih paket mingguan atau bulanan dan bayar harga flat dengan QRIS atau Virtual Account.", code: "bayar = harga_paket" },
  { title: "Kredit masuk", tag: "KREDIT", text: "Setelah pembayaran terkonfirmasi, kredit dolar paket aktif di akun Anda.", code: "kredit = kredit_paket" },
  { title: "Pemakaian", tag: "POTONG", text: "Tiap request memotong kredit sesuai tarif model di katalog. Jika kredit habis, request ditolak.", code: "kredit -= token × tarif" },
  {
    title: "Hangus",
    tag: "AKHIR MASA AKTIF",
    text: "Saat masa aktif berakhir, sisa kredit hangus dan tidak dapat diuangkan. Membeli paket baru menggantikan paket yang sedang aktif.",
    code: "kredit = 0  // di akhir masa aktif",
    last: true,
  },
];

export function BillingSection({ plan, fx }: { plan: Plan | null; fx: FxRate | null }) {
  return (
    <section className="section-dark section-rule border-y border-line">
      <div className="container-x grid gap-12 py-20 sm:py-28 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
        <div>
          <div className="reveal">
            <p className="eyebrow">Kredit paket</p>
            <h2 className="mt-4 text-[34px] leading-[1.08] font-medium tracking-[-0.035em] text-heading sm:text-5xl">
              Bayar flat sekali.
              <br />
              <span className="text-fg-muted">Sisa kredit hangus di akhir.</span>
            </h2>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-fg-muted">
              Harga paket tetap dan diketahui di depan. Kredit hanya berlaku selama masa aktif paket, jadi pilih paket yang
              sesuai dengan pemakaian Anda.
            </p>
          </div>

          <ol className="mt-12 border-t border-line">
            {STEPS.map((s, i) => (
              <li key={s.title} className="reveal grid grid-cols-[2rem_1fr] gap-x-3 border-b border-line py-6">
                <span className={`pt-1 font-mono text-sm ${s.last ? "text-primary-ink" : "text-faint"}`}>{i + 1}</span>
                <div>
                  <h3 className="flex flex-wrap items-center gap-3 text-xl font-medium tracking-[-0.01em]">
                    <span className={s.last ? "text-primary-ink" : "text-heading"}>{s.title}</span>
                    <span className="rounded border border-line-strong bg-primary-tint px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-primary-ink">
                      {s.tag}
                    </span>
                  </h3>
                  <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-fg-muted">{s.text}</p>
                  <p className="mt-2 font-mono text-xs text-faint">{s.code}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex flex-col justify-between gap-8 lg:pt-4">
          <Link href={site.links.docs} className="inline-flex items-center gap-1.5 self-end text-sm font-semibold text-primary-ink hover:underline">
            Baca dokumentasi
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>

          {plan && (
            <div className="reveal grad-border rounded-card-lg p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[15px] font-medium text-heading">
                    Paket {plan.name} {formatUsd(plan.creditUsd)}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-faint">Contoh · berlaku {plan.durationDays} hari sejak pembayaran</p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-tint px-2.5 py-1 font-mono text-[11px] text-primary-ink">
                  <ShieldCheck className="size-3.5" aria-hidden /> harga flat
                </span>
              </div>
              <dl className="mt-6 space-y-3.5 text-[15px]">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-fg-soft">Harga paket</dt>
                  <dd className="font-mono text-lg text-heading">{formatIdr(plan.priceIdr)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-fg-soft">Kredit masuk</dt>
                  <dd className="flex items-baseline gap-3">
                    <UsdIdr usd={plan.creditUsd} fx={fx} />
                    <span className="font-mono text-lg text-heading">{formatUsd(plan.creditUsd)}</span>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-fg-soft">Sisa di akhir masa aktif</dt>
                  <dd className="font-mono text-lg text-primary-ink">hangus</dd>
                </div>
              </dl>
              <div className="mt-6" aria-hidden>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div className="h-full w-full rounded-full" style={{ backgroundImage: "linear-gradient(90deg, var(--grad-from), var(--grad-to))" }} />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[11px] text-faint">
                  <span>hari 1 · kredit aktif</span>
                  <span>hari {plan.durationDays} · berakhir</span>
                </div>
              </div>
              <p className="mt-5 flex items-start gap-2 border-t border-line pt-4 text-xs text-fg-muted">
                <ShieldCheck className="mt-px size-3.5 shrink-0 text-primary-ink" aria-hidden />
                Kredit tidak dapat diuangkan atau dipindahkan. Estimasi rupiah hanya keterangan.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
