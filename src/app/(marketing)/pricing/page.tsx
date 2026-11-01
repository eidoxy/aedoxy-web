import { Info } from "lucide-react";
import type { Metadata } from "next";
import { ActivityTicker } from "@/components/marketing/activity-ticker";
import { FaqSection } from "@/components/marketing/faq-section";
import { PlanTabs } from "@/components/marketing/plan-tabs";
import { FxFootnote } from "@/components/usd-idr";
import { getActivity, getFxRate, getPlans } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Paket langganan",
  description: "Paket mingguan dan bulanan berharga flat dalam rupiah. Kredit hangus di akhir masa aktif.",
};

export default async function PricingPage() {
  const [plans, fx, activity] = await Promise.all([getPlans(), getFxRate(), getActivity()]);

  return (
    <>
      <section>
        <div className="container-x py-14 sm:py-20">
          <p className="eyebrow">Pricing</p>
          <h1 className="mt-4 text-[44px] leading-none font-medium tracking-[-0.045em] text-heading sm:text-6xl">Paket langganan</h1>
          <p className="mt-6 max-w-2xl text-[17px] leading-relaxed text-fg-muted">
            Bayar harga flat dalam rupiah, dapatkan kredit dolar yang berlaku selama masa aktif paket. Sisa kredit hangus di akhir
            masa aktif dan tidak dapat diuangkan.
          </p>
        </div>
      </section>
      <ActivityTicker initialItems={activity} />
      <section className="container-x py-12 sm:py-16">
        <PlanTabs plans={plans} fx={fx} />
        <p className="mt-8 flex items-start gap-2.5 rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-fg-muted">
          <Info className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
          <span>
            Satu akun hanya punya satu paket aktif. Jika Anda membeli paket baru saat paket lama masih aktif, paket lama diganti
            dan sisa kreditnya hangus. Anda akan diminta mengonfirmasi hal ini sebelum membayar.
          </span>
        </p>
        <FxFootnote fx={fx} className="mt-4" />
      </section>
      <FaqSection />
    </>
  );
}
