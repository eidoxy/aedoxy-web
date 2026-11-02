"use client";

import Link from "next/link";
import { LogoMark, Logo } from "@/components/brand/logo";
import type { BrandInfo } from "@/lib/brand";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";
import { navFor, type ConsoleVariant } from "@/navigation";
import { NavMain } from "./nav-main";
import { NavUser, type NavUserProps } from "./nav-user";

type Props = NavUserProps & {
  variant: ConsoleVariant;
  has2fa: boolean;
  brand: BrandInfo;
  /** Server-rendered summary card (plan or pool); the sidebar hides it when collapsed. */
  footerCard: React.ReactNode;
};

export function AppSidebar({ variant, has2fa, brand, user, switchPanel, footerCard }: Props) {
  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
          <Logo brand={brand} />
          <span className="mono-label rounded border border-line px-1.5 py-0.5">{variant === "admin" ? "Admin" : "Console"}</span>
        </div>
        <Link
          href="/"
          aria-label={`${brand.name}, beranda`}
          className="hidden size-8 items-center justify-center rounded-md group-data-[collapsible=icon]:flex"
        >
          <LogoMark brand={brand} className="size-7" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavMain groups={navFor(variant, has2fa)} />
      </SidebarContent>
      <SidebarFooter>
        <div className="group-data-[collapsible=icon]:hidden">{footerCard}</div>
        <NavUser user={user} switchPanel={switchPanel} />
      </SidebarFooter>
    </Sidebar>
  );
}
