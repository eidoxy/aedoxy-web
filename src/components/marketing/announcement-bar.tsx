"use client";

import { ArrowUpRight, X } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Announcement } from "@/server/catalog/types";

const listeners = new Set<() => void>();
// Fallback for browsers that block localStorage: dismissal lasts until reload.
const dismissedInMemory = new Set<string>();
const storageKey = (id: string) => `announcement-dismissed:${id}`;

function isDismissed(id: string): boolean {
  if (dismissedInMemory.has(id)) return true;
  try {
    return localStorage.getItem(storageKey(id)) === "1";
  } catch {
    return false;
  }
}

function dismiss(id: string) {
  dismissedInMemory.add(id);
  try {
    localStorage.setItem(storageKey(id), "1");
  } catch {
    // keep the in-memory flag only
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Dismissible bar. Rendered visible on the server so it also shows without JS. */
export function AnnouncementBar({ item }: { item: Announcement }) {
  const hidden = useSyncExternalStore(subscribe, () => isDismissed(item.id), () => false);
  if (hidden) return null;
  return (
    <div className="relative border-b border-primary-ink/15 bg-primary-tint text-fg">
      <div className="container-x flex min-h-10 items-center justify-center gap-3 py-2 pr-10 text-sm">
        <span className="rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary-foreground uppercase">
          {item.badge}
        </span>
        <p className="min-w-0">
          <span>{item.text}</span>{" "}
          <Link href={item.href} className="inline-flex items-center gap-1 font-semibold whitespace-nowrap hover:underline">
            {item.linkLabel}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </p>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => dismiss(item.id)}
            aria-label="Tutup pengumuman"
            className="absolute top-1/2 right-3 -mt-4 rounded-md text-fg-muted hover:bg-line hover:text-fg sm:right-6 dark:hover:bg-line"
          >
            <X aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Tutup pengumuman</TooltipContent>
      </Tooltip>
    </div>
  );
}
