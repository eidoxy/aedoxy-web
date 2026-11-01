import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { site } from "@/config/site";
import { HeaderShell } from "./header-shell";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <HeaderShell>
      <div className="container-x relative grid h-16 grid-cols-[1fr_auto] items-center gap-4 md:h-20 md:grid-cols-[1fr_auto_1fr]">
        <Logo className="justify-self-start" />
        <NavLinks items={site.nav} className="hidden md:block" />
        <div className="flex items-center gap-2.5 justify-self-end">
          <ThemeToggle />
          <Button asChild className="hidden h-10 px-4 text-sm font-semibold md:inline-flex">
            <Link href={site.links.register}>
              Mulai
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
          <MobileNav items={site.nav} ctaHref={site.links.register} />
        </div>
      </div>
    </HeaderShell>
  );
}
