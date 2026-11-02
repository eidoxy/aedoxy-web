import { cookies } from "next/headers";
import { Suspense } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { ConsoleVariant } from "@/navigation";
import { requireAdmin } from "@/server/admin";
import { requireSession } from "@/server/session";
import { AppSidebar } from "./app-sidebar";
import { ConsoleHeader } from "./console-header";
import { AdminPoolCard, SidebarCardSkeleton, UserPlanCard } from "./sidebar-cards";

/**
 * Gate and shell in one component. The guard runs first and nothing role-specific (menu, names, cards) is
 * rendered before it passes, so a visitor who is refused never sees the console. Render it inside <Suspense>
 * with <ShellFallback/>. Pages still call requireSession()/requireAdmin() themselves (layouts do not re-render
 * on client navigation).
 */
export async function ConsoleShell({ variant, children }: { variant: ConsoleVariant; children: React.ReactNode }) {
  // The admin guard lets an admin without 2FA through, only so /admin/security can render.
  const session = variant === "admin" ? await requireAdmin({ allowWithout2fa: true }) : await requireSession();
  const { user } = session;
  const has2fa = user.twoFactorEnabled === true;
  const isAdmin = user.role === "admin";
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  const switchPanel = !isAdmin
    ? null
    : variant === "admin"
      ? { href: "/dashboard", label: "Panel pengguna" }
      : { href: "/admin", label: "Panel admin" };

  // Admins who still need 2FA get no pool data: every page except /admin/security redirects them anyway.
  const footerCard =
    variant === "user" ? (
      <Suspense fallback={<SidebarCardSkeleton />}>
        <UserPlanCard userId={user.id} />
      </Suspense>
    ) : has2fa ? (
      <Suspense fallback={<SidebarCardSkeleton />}>
        <AdminPoolCard />
      </Suspense>
    ) : null;

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        variant={variant}
        has2fa={has2fa}
        user={{ name: user.name, email: user.email }}
        switchPanel={switchPanel}
        footerCard={footerCard}
      />
      <SidebarInset className="min-w-0">
        <ConsoleHeader variant={variant} has2fa={has2fa} />
        <main id="main" className="min-w-0 flex-1 p-4 md:p-6">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
