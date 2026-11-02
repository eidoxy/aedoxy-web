"use client";

import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { openConsole, type OpenConsoleState } from "@/app/(panel)/actions";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { isItemActive, isSubActive, type NavGroup, type NavMainItem } from "@/navigation/nav";

/** "Console API": runs the openConsole server action (links the console account, then redirects). */
function OpenConsoleItem({ item }: { item: NavMainItem }) {
  const [state, action, pending] = useActionState<OpenConsoleState>(openConsole, {});
  return (
    <SidebarMenuItem>
      <form action={action}>
        <SidebarMenuButton type="submit" tooltip={item.title} disabled={pending} aria-invalid={state.error ? true : undefined}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : item.icon && <item.icon aria-hidden />}
          <span>{item.title}</span>
        </SidebarMenuButton>
      </form>
      {state.error && (
        <p role="alert" className="px-2 pt-1 text-xs text-danger group-data-[collapsible=icon]:sr-only">
          {state.error}
        </p>
      )}
    </SidebarMenuItem>
  );
}

function Parent({ groups, item, pathname }: { groups: readonly NavGroup[]; item: NavMainItem; pathname: string }) {
  const { state, isMobile } = useSidebar();
  const active = isItemActive(groups, pathname, item);
  const subs = item.subItems ?? [];

  if (state === "collapsed" && !isMobile) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton tooltip={item.title} isActive={active}>
              {item.icon && <item.icon aria-hidden />}
              <span>{item.title}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" side="right" align="start">
            {subs.map((sub) => (
              <DropdownMenuItem key={sub.url} asChild>
                <Link href={sub.url} aria-current={isSubActive(groups, pathname, sub) ? "page" : undefined}>
                  {sub.title}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    );
  }

  return (
    // key forces a fresh defaultOpen when navigation lands inside this group.
    <Collapsible key={String(active)} asChild defaultOpen={active} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.title} isActive={active}>
            {item.icon && <item.icon aria-hidden />}
            <span>{item.title}</span>
            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" aria-hidden />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {subs.map((sub) => (
              <SidebarMenuSubItem key={sub.url}>
                <SidebarMenuSubButton asChild isActive={isSubActive(groups, pathname, sub)}>
                  <Link href={sub.url}>
                    <span>{sub.title}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

export function NavMain({ groups }: { groups: readonly NavGroup[] }) {
  const pathname = usePathname();
  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.id}>
          {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                if (item.subItems) return <Parent key={item.title} groups={groups} item={item} pathname={pathname} />;
                if (item.action === "open-console") return <OpenConsoleItem key={item.title} item={item} />;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild tooltip={item.title} isActive={isItemActive(groups, pathname, item)}>
                      <Link href={item.url ?? "/"}>
                        {item.icon && <item.icon aria-hidden />}
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
