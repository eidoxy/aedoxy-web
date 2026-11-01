import { Providers } from "@/components/providers";
import { AnnouncementBar } from "@/components/marketing/announcement-bar";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getAnnouncement } from "@/server/catalog";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const announcement = await getAnnouncement();
  return (
    <Providers>
      {announcement && <AnnouncementBar item={announcement} />}
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </Providers>
  );
}
