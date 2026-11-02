"use client";

import { ChevronsUpDown, LayoutPanelLeft, Loader2, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/format";

export type NavUserProps = {
  user: { name: string; email: string };
  /** Link to the other panel; only passed for admins. */
  switchPanel: { href: string; label: string } | null;
};

function Identity({ user }: { user: NavUserProps["user"] }) {
  return (
    <>
      <Avatar className="size-8 rounded-lg">
        <AvatarFallback className="rounded-lg bg-primary-tint text-primary-ink">{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium text-heading">{user.name}</span>
        <span className="truncate text-xs text-fg-muted">{user.email}</span>
      </div>
    </>
  );
}

export function NavUser({ user, switchPanel }: NavUserProps) {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" tooltip={user.name} className="data-[state=open]:bg-sidebar-accent">
              <Identity user={user} />
              <ChevronsUpDown className="ml-auto size-4" aria-hidden />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg" side={isMobile ? "bottom" : "right"} align="end" sideOffset={4}>
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <Identity user={user} />
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings aria-hidden />
                  Pengaturan akun
                </Link>
              </DropdownMenuItem>
              {switchPanel && (
                <DropdownMenuItem asChild>
                  <Link href={switchPanel.href}>
                    <LayoutPanelLeft aria-hidden />
                    {switchPanel.label}
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={pending} onSelect={() => void signOut()}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <LogOut aria-hidden />}
              Keluar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
