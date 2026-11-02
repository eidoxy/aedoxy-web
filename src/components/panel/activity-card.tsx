"use client";

import { useState, useSyncExternalStore } from "react";
import { ActivityPoller, clockSnapshot, line, subscribeClock, subscribeNever } from "@/components/marketing/activity-ticker";
import { MIN_ACTIVITY_ITEMS } from "@/lib/activity";
import type { ActivityItem } from "@/server/catalog/types";

const SHOWN = 5;

/** Static "Aktivitas terbaru" list for /plans (F07): 5 items, refreshed every 60 s, no entrance animation. Hidden under 3 items. */
export function ActivityCard({ initialItems }: { initialItems: ActivityItem[] }) {
  const [items, setItems] = useState(initialItems);
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const now = useSyncExternalStore(subscribeClock, clockSnapshot, () => null);

  if (items.length < MIN_ACTIVITY_ITEMS) return mounted ? <ActivityPoller initialItems={initialItems} onItems={setItems} /> : null;
  return (
    <section aria-labelledby="activity-card-title" className="mt-10 rounded-[18px] border border-line bg-surface p-6">
      {mounted && <ActivityPoller initialItems={initialItems} onItems={setItems} />}
      <h2 id="activity-card-title" className="text-lg font-medium text-heading">
        Aktivitas terbaru
      </h2>
      <ul className="mt-3 space-y-2 font-mono text-[13px] text-fg-soft">
        {items.slice(0, SHOWN).map((item) => (
          <li key={`${item.at}-${item.label}`}>{line(item, now)}</li>
        ))}
      </ul>
    </section>
  );
}
