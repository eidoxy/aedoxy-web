import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { Providers } from "@/components/providers";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <div className="container-x flex flex-1 flex-col gap-6 py-6 md:flex-row md:gap-10 md:py-10">
        <aside className="shrink-0 md:w-52">
          <div className="flex items-center justify-between md:mb-6">
            <Logo />
            <ThemeToggle />
          </div>
          <div className="mt-4 md:mt-0">
            <AdminNav />
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1">
          <Suspense fallback={<div aria-hidden className="h-72 max-w-3xl rounded-[18px] border border-line bg-surface" />}>
            <AdminGate>{children}</AdminGate>
          </Suspense>
        </main>
      </div>
    </Providers>
  );
}

/**
 * First line of defence: a non-admin gets the 404 page. Layouts do not re-render on client
 * navigation, so every page, server action and route handler under /admin calls requireAdmin() itself.
 */
async function AdminGate({ children }: { children: React.ReactNode }) {
  await requireAdmin({ allowWithout2fa: true });
  return children;
}
