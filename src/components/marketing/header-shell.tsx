"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

function subscribe(cb: () => void) {
  window.addEventListener("scroll", cb, { passive: true });
  return () => window.removeEventListener("scroll", cb);
}

/** Sticky wrapper that gains a bottom border once the page scrolls (UI-GUIDE). */
export function HeaderShell({ children }: { children: React.ReactNode }) {
  const scrolled = useSyncExternalStore(subscribe, () => window.scrollY > 4, () => false);
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-bg/85 backdrop-blur-md transition-colors",
        scrolled ? "border-line" : "border-transparent",
      )}
    >
      {children}
    </header>
  );
}
