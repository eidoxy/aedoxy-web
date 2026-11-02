import { Suspense } from "react";
import { ConsoleShell } from "@/components/console/console-shell";
import { ShellFallback } from "@/components/console/shell-fallback";
import { Providers } from "@/components/providers";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <Suspense fallback={<ShellFallback />}>
        <ConsoleShell variant="user">{children}</ConsoleShell>
      </Suspense>
    </Providers>
  );
}
