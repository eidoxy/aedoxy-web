import type { Metadata } from "next";
import { DocsHero } from "@/components/docs/docs-hero";
import { DocsLayout } from "@/components/docs/docs-layout";
import { DocsProvider } from "@/components/docs/docs-provider";
import { EndpointSection } from "@/components/docs/endpoint-section";
import { IntegrationsSection } from "@/components/docs/integrations-section";
import { StartSection } from "@/components/docs/start-section";
import { TroubleshootingSection } from "@/components/docs/troubleshooting-section";
import { site } from "@/config/site";
import { getSiteSettings } from "@/server/site";

export const metadata: Metadata = {
  title: "Dokumentasi",
  description: "Panduan base URL, API key, dan konfigurasi untuk Claude Code, Codex CLI, OpenCode, Cursor, 9Router, SDK, dan cURL.",
  alternates: { canonical: "/docs" },
};

export default async function DocsPage() {
  const { brandName, apiBaseUrl, sampleModel } = await getSiteSettings();
  return (
    <DocsProvider brandName={brandName || site.name} apiBaseUrl={apiBaseUrl} sampleModel={sampleModel}>
      <DocsHero />
      <DocsLayout>
        <StartSection />
        <EndpointSection />
        <IntegrationsSection />
        <TroubleshootingSection />
      </DocsLayout>
    </DocsProvider>
  );
}
