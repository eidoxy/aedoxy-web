"use client";

import { useState, useSyncExternalStore } from "react";
import { ActivityPoller, clockSnapshot, line, subscribeClock, subscribeNever } from "@/components/marketing/activity-ticker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <section aria-labelledby="activity-card-title">
      <Card>
        {mounted && <ActivityPoller initialItems={initialItems} onItems={setItems} />}
        <CardHeader>
          <CardTitle>
            <h2 id="activity-card-title">Aktivitas terbaru</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 font-mono text-[13px] text-fg-soft">
            {items.slice(0, SHOWN).map((item) => (
              <li key={`${item.at}-${item.label}`}>{line(item, now)}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
