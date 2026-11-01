import { ActivityTicker } from "@/components/marketing/activity-ticker";
import { BillingSection } from "@/components/marketing/billing-section";
import { CtaSection } from "@/components/marketing/cta-section";
import { FaqSection } from "@/components/marketing/faq-section";
import { Hero } from "@/components/marketing/hero";
import { IntegrationsSection } from "@/components/marketing/integrations-section";
import { PlanTabs } from "@/components/marketing/plan-tabs";
import { PlatformSection } from "@/components/marketing/platform-section";
import { RankingsSection } from "@/components/marketing/rankings-section";
import { StatsStrip } from "@/components/marketing/stats-strip";
import { StepsSection } from "@/components/marketing/steps-section";
import { FxFootnote } from "@/components/usd-idr";
import { site } from "@/config/site";
import { featuredPlan } from "@/lib/plans";
import { getActivity, getFxRate, getModels, getPlans, getProviders, getRankings, getStats } from "@/server/catalog";

export default async function HomePage() {
  const [plans, providers, models, stats, fx, activity, rankings] = await Promise.all([
    getPlans(),
    getProviders(),
    getModels(),
    getStats(),
    getFxRate(),
    getActivity(),
    getRankings(),
  ]);
  const featured = featuredPlan(plans);

  return (
    <>
      <Hero plans={plans} models={models} providers={providers} />
      <ActivityTicker initialItems={activity} />
      <StatsStrip stats={stats} models={models} providers={providers} />
      <PlatformSection models={models} providers={providers} plan={featured} fx={fx} />
      <RankingsSection rankings={rankings} providers={providers} />
      <StepsSection plan={featured} />
      <IntegrationsSection apiBaseUrl={site.apiBaseUrl} modelId={models[0]?.id ?? "nama-model"} />
      <BillingSection plan={featured} fx={fx} />
      <section id="paket" className="section-rule">
        <div className="container-x py-20 sm:py-28">
          <div className="reveal mb-10">
            <p className="eyebrow">Paket</p>
            <h2 className="mt-4 text-[34px] leading-[1.08] font-medium tracking-[-0.035em] text-heading sm:text-5xl">
              Pilih paket
              <br />
              <span className="text-fg-muted">yang sesuai pemakaian Anda.</span>
            </h2>
          </div>
          <PlanTabs plans={plans} fx={fx} />
          <FxFootnote fx={fx} className="mt-6" />
        </div>
      </section>
      <FaqSection />
      <CtaSection />
    </>
  );
}
