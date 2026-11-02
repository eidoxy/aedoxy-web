"use client";

import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { navFor, type ConsoleVariant } from "@/navigation";
import { pageTitle } from "@/navigation/nav";
import { SearchDialog } from "./search-dialog";

export function ConsoleHeader({ variant, has2fa }: { variant: ConsoleVariant; has2fa: boolean }) {
  const groups = navFor(variant, has2fa);
  const title = pageTitle(groups, usePathname());
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4 md:px-6">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-heading">{title}</p>
      <SearchDialog groups={groups} />
      <ThemeToggle />
    </header>
  );
}
