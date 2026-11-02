"use client";

import { useQuery } from "@tanstack/react-query";
import { Pause, Play, Zap } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MIN_ACTIVITY_ITEMS } from "@/lib/activity";
import { formatAge } from "@/lib/format";
import { activityListSchema } from "@/lib/schemas/activity";
import { cn } from "@/lib/utils";
import type { ActivityItem } from "@/server/catalog/types";

const ROTATE_MS = 4000;
const POLL_MS = 60_000;

async function fetchActivity(): Promise<ActivityItem[]> {
  const res = await fetch("/api/public/activity");
  if (!res.ok) throw new Error(`activity ${res.status}`);
  return activityListSchema.parse(await res.json());
}

// Minute-aligned "now". Null on the server, so the first paint has no relative time and nothing mismatches.
export function subscribeClock(cb: () => void) {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
}
export const clockSnapshot = () => Math.floor(Date.now() / 60_000) * 60_000;

export function line(item: ActivityItem, now: number | null) {
  const age = now === null ? "" : ` · ${formatAge(now - Date.parse(item.at))}`;
  return `${item.label} berlangganan ${item.plan}${age}`;
}

/**
 * One-line vertical ticker (F07): swaps every 4s, stops on hover/focus, has a
 * pause button, and swaps without motion under prefers-reduced-motion. Hidden
 * when fewer than 3 items exist. aria-live is off; the full list sits in a popover.
 */
export const subscribeNever = () => () => {};

/**
 * Polls the feed (TanStack Query, F07). Mounted only after hydration: Query reads
 * Date.now() while seeding data, which Cache Components forbids during prerender.
 * Renders nothing; it pushes fresh items up to the ticker.
 */
export function ActivityPoller({ initialItems, onItems }: { initialItems: ActivityItem[]; onItems: (items: ActivityItem[]) => void }) {
  const { data } = useQuery({
    queryKey: ["public-activity"],
    queryFn: fetchActivity,
    initialData: initialItems,
    staleTime: 30_000,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  });
  useEffect(() => {
    onItems(data);
  }, [data, onItems]);
  return null;
}

export function ActivityTicker({ initialItems, className }: { initialItems: ActivityItem[]; className?: string }) {
  const [items, setItems] = useState(initialItems);
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, () => null);
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  const count = items.length;
  const running = !userPaused && !hovered && !focused && count >= MIN_ACTIVITY_ITEMS;

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setIndex((i) => i + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, [running]);

  if (count < MIN_ACTIVITY_ITEMS) return null;
  const current = items[index % count];
  const pauseLabel = userPaused ? "Lanjutkan pergantian aktivitas" : "Jeda pergantian aktivitas";

  return (
    <section
      aria-label="Aktivitas pembelian terbaru"
      className={cn("border-y border-line bg-surface-2", className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {mounted && <ActivityPoller initialItems={initialItems} onItems={setItems} />}
      <div className="container-x flex min-h-12 items-center gap-3 py-2">
        <Zap className="size-4 shrink-0 text-primary-ink" aria-hidden />
        <div className="min-w-0 flex-1 overflow-hidden">
          <p key={`${index % count}`} aria-live="off" className="ticker-item truncate font-mono text-[13px] text-fg-soft">
            {line(current, now)}
          </p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="link" className="h-auto rounded px-2 py-1 font-mono text-xs text-primary-ink">
              <span className="sm:hidden">Semua</span>
              <span className="hidden sm:inline">Lihat aktivitas terbaru</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-[min(20rem,calc(100vw-2.5rem))] gap-0 rounded-xl border border-line bg-surface p-4 font-mono text-xs text-fg-soft shadow-card-hover"
          >
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={`${item.at}-${item.label}`}>{line(item, now)}</li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setUserPaused((p) => !p)}
              aria-pressed={userPaused}
              aria-label={pauseLabel}
              className="shrink-0 border-line-strong bg-surface text-fg-muted hover:bg-surface hover:text-fg dark:border-line-strong dark:bg-surface dark:hover:bg-surface"
            >
              {userPaused ? <Play className="size-3.5" aria-hidden /> : <Pause className="size-3.5" aria-hidden />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{pauseLabel}</TooltipContent>
        </Tooltip>
      </div>
    </section>
  );
}
