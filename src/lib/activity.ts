import type { ActivityItem } from "@/server/catalog/types";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_ACTIVITY_ITEMS = 3;

/**
 * F07 data rules: drop items older than 7 days, and hide the whole feed when
 * fewer than 3 items remain (a sparse feed makes the product look empty).
 */
export function visibleActivity(items: ActivityItem[], now: number): ActivityItem[] {
  const fresh = items.filter((i) => {
    const age = now - Date.parse(i.at);
    return Number.isFinite(age) && age >= 0 && age <= MAX_AGE_MS;
  });
  return fresh.length >= MIN_ACTIVITY_ITEMS ? fresh : [];
}
