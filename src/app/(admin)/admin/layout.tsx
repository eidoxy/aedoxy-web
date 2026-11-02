import type { Metadata } from "next";
import { Suspense } from "react";
import { ConsoleShell } from "@/components/console/console-shell";
import { ShellFallback } from "@/components/console/shell-fallback";
import { Providers } from "@/components/providers";

export const metadata: Metadata = { title: { default: "Admin", template: "%s | Admin" }, robots: { index: false, follow: false } };

/** The gate lives inside ConsoleShell: a non-admin gets the 404 page before any admin menu is rendered. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <Suspense fallback={<ShellFallback />}>
        <ConsoleShell variant="admin">{children}</ConsoleShell>
      </Suspense>
    </Providers>
  );
}
