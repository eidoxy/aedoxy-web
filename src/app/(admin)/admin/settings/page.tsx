import type { Metadata } from "next";
import { Suspense } from "react";
import { AnnouncementForm, BrandForm, ContactForm, DocsForm, LogoSection, SocialForm, type AssetInfo } from "@/components/admin/site-settings-forms";
import { PageHeader } from "@/components/console/page-header";
import { FormPageSkeleton } from "@/components/console/skeletons";
import type { AssetKind } from "@/lib/image-check";
import { requireAdmin } from "@/server/admin";
import { loadSiteSettings } from "@/server/domain/site-settings";
import { configuredSocialProviders } from "@/server/social-providers";

export const metadata: Metadata = { title: "Pengaturan situs" };

export default function SiteSettingsPage() {
  return (
    <Suspense fallback={<FormPageSkeleton fields={5} />}>
      <SiteSettingsContent />
    </Suspense>
  );
}

async function SiteSettingsContent() {
  await requireAdmin();
  // Read straight from the database, not the public cache, so the form always shows what is stored.
  const s = await loadSiteSettings();
  const assets: Partial<Record<AssetKind, AssetInfo>> = Object.fromEntries(Object.entries(s.assets).map(([k, a]) => [k, { url: a.url, width: a.width, height: a.height, contentType: a.contentType, size: a.size }]));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Pengaturan situs"
        description="Brand, logo, kontak, pengumuman, dan contoh kode di situs publik. Setiap perubahan dicatat di audit log dan tampil di situs dalam beberapa menit."
      />
      <BrandForm initial={s} />
      <LogoSection assets={assets} hideWordmark={s.hideWordmark} brandName={s.brandName} />
      <ContactForm initial={s} />
      <SocialForm initial={s} configured={configuredSocialProviders()} />
      <AnnouncementForm initial={s.announcement} />
      <DocsForm initial={s} />
    </div>
  );
}
