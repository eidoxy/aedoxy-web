import type { ActivityItem } from "@/server/catalog/types";

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_ACTIVITY_ITEMS = 3;
export const MAX_ACTIVITY_ITEMS = 20;
export const ACTIVITY_WINDOW_MS = MAX_AGE_MS;

const segmenter = new Intl.Segmenter("id", { granularity: "grapheme" });

/**
 * F07 display name: first character + "•••" + last character, counted in
 * grapheme clusters so emoji and combined characters are never cut in half.
 * Two characters or fewer, or anything that looks like an email, becomes "Pengguna".
 */
export function maskName(name: string): string {
  const clean = name.trim();
  if (clean.includes("@")) return "Pengguna";
  const chars = Array.from(segmenter.segment(clean), (s) => s.segment);
  if (chars.length <= 2) return "Pengguna";
  return `${chars[0]}•••${chars[chars.length - 1]}`;
}

/** ISO time cut to the minute, so the exact payment second never leaves the server. */
export function roundToMinute(date: Date): string {
  return `${date.toISOString().slice(0, 16)}:00Z`;
}

export type ActivityRow = { userId: string; name: string; plan: string; paidAt: Date };

/** Newest first in: at most one row per user, MAX_ACTIVITY_ITEMS rows out. Rows with an invalid time are skipped. */
export function pickActivityRows<T extends ActivityRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  const picked: T[] = [];
  for (const row of rows) {
    if (seen.has(row.userId) || Number.isNaN(row.paidAt.getTime())) continue;
    seen.add(row.userId);
    picked.push(row);
    if (picked.length === MAX_ACTIVITY_ITEMS) break;
  }
  return picked;
}

export const toActivityItem = (row: ActivityRow): ActivityItem => ({
  label: maskName(row.name),
  plan: row.plan,
  at: roundToMinute(row.paidAt),
});

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
