import { ArrowUpRight } from "lucide-react";
import { SiteLogo } from "@/components/brand/site-logo";
import { site } from "@/config/site";
import { HeaderShell } from "./header-shell";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { SessionCta } from "./session-cta";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <HeaderShell>
      <div className="container-x relative grid h-16 grid-cols-[1fr_auto] items-center gap-4 md:h-20 md:grid-cols-[1fr_auto_1fr]">
        <SiteLogo className="justify-self-start" />
        <NavLinks items={site.nav} className="hidden md:block" />
        <div className="flex items-center gap-2.5 justify-self-end">
          <ThemeToggle />
          <SessionCta
            label="Mulai"
            href={site.links.register}
            icon={<ArrowUpRight className="size-3.5" aria-hidden />}
            className="hidden h-10 min-w-[8.5rem] justify-center px-4 text-sm font-semibold md:inline-flex"
          />
          <MobileNav items={site.nav} ctaHref={site.links.register} />
        </div>
      </div>
    </HeaderShell>
  );
}
