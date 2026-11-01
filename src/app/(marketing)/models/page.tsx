import { Info } from "lucide-react";
import type { Metadata } from "next";
import { ModelsCatalog } from "@/components/marketing/models-catalog";
import { getFxRate, getModels, getProviders, getStats } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Katalog model",
  description: "Daftar model per provider, context, kemampuan, dan biaya kredit per 1 juta token.",
};

export default async function ModelsPage() {
  const [providers, models, fx, stats] = await Promise.all([getProviders(), getModels(), getFxRate(), getStats()]);

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
              <dd className="text-5xl leading-none font-medium tracking-[-0.04em] text-heading">{stats.models}</dd>
              <dt className="mono-label mt-2">Model</dt>
            </div>
            <div>
              <dd className="text-5xl leading-none font-medium tracking-[-0.04em] text-heading">{stats.providers}</dd>
              <dt className="mono-label mt-2">Provider</dt>
            </div>
          </dl>
        </div>
      </section>
      <section className="container-x py-10 sm:py-12">
        <ModelsCatalog providers={providers} models={models} fx={fx} />
      </section>
    </>
  );
}
