import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { Providers } from "@/components/providers";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { requireSession } from "@/server/session";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <header className="border-b border-line">
        <div className="container-x flex h-16 items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="container-x flex-1 py-10 sm:py-14">
        <Suspense fallback={<div aria-hidden className="h-72 max-w-2xl rounded-[18px] border border-line bg-surface" />}>
          <SessionGate>{children}</SessionGate>
        </Suspense>
      </main>
    </Providers>
  );
}

/** Guards every panel route. Pages still call requireSession() themselves: layouts do not re-render on client navigation. */
async function SessionGate({ children }: { children: React.ReactNode }) {
  await requireSession();
  return children;
}
