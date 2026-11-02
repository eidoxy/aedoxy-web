import { Info } from "lucide-react";
import type { Metadata } from "next";
import { ModelsCatalog } from "@/components/marketing/models-catalog";
import { featuredPlan } from "@/lib/plans";
import { getCatalog, getFxRate, getPlans } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Katalog model",
  description: "Daftar model per provider, context, kemampuan, dan biaya kredit per 1 juta token.",
};

export default async function ModelsPage() {
  const [{ providers, models, state }, fx, plans] = await Promise.all([getCatalog(), getFxRate(), getPlans()]);
  const plan = featuredPlan(plans);

  return (
    <>
      <section className="border-b border-line">
        <div className="container-x flex flex-col gap-10 py-14 sm:py-20 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-[44px] leading-none font-medium tracking-[-0.045em] text-heading sm:text-6xl">Katalog model</h1>
            <p className="mt-6 text-[17px] leading-relaxed text-fg-muted">
              Jelajahi model per provider, kemampuannya, dan biaya kredit per 1 juta token. Satu API key untuk semuanya.
            </p>
            <p className="mt-4 flex items-start gap-2.5 text-[13px] leading-relaxed text-fg-muted">
              <Info className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
              <span>
                Harga resmi adalah harga list provider per 1 juta token (input / output). Biaya kredit adalah yang dipotong dari
                kredit paket Anda, dalam dolar, dan tidak dikonversi ke rupiah. Angka hemat memakai asumsi 3 token input untuk
                tiap 1 token output dan membandingkan dolar dengan dolar; harga paket tidak ikut dihitung.
              </span>
            </p>
          </div>
          <dl className="flex gap-10">
            <div>
              <dd className="text-5xl leading-none font-medium tracking-[-0.04em] text-heading">{models.length}</dd>
              <dt className="mono-label mt-2">Model</dt>
            </div>
            <div>
              <dd className="text-5xl leading-none font-medium tracking-[-0.04em] text-heading">{providers.length}</dd>
              <dt className="mono-label mt-2">Provider</dt>
            </div>
          </dl>
        </div>
      </section>
      <section className="container-x py-10 sm:py-12">
        {state === "stale" && (
          <p role="status" className="mb-6 rounded-xl border border-line bg-alt p-4 text-sm text-fg-soft">
            Data harga terbaru belum bisa dimuat. Daftar di bawah adalah data terakhir yang berhasil diambil.
          </p>
        )}
        {models.length === 0 ? (
          <div className="rounded-card-lg border border-line bg-surface p-10 text-center">
            <p className="text-heading">Daftar model belum tersedia.</p>
            <p className="mt-2 text-sm text-fg-muted">
              {state === "unavailable" ? "Data model belum bisa dimuat saat ini. Coba lagi beberapa saat lagi." : "Belum ada model yang ditampilkan."}
            </p>
          </div>
        ) : (
          <ModelsCatalog providers={providers} models={models} fx={fx} plan={plan} />
        )}
      </section>
    </>
  );
}
