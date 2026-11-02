import type { LucideIcon } from "lucide-react";

/** Console sidebar menu model, shared by the sidebar, the search palette and the page title. Pure: no React, no server code. */

export type NavSubItem = { title: string; url: string };

export type NavMainItem = {
  title: string;
  icon?: LucideIcon;
  /** Link target. Absent on parents of a sub-menu and on action items. */
  url?: string;
  /** Match the path exactly (overview pages) instead of by prefix. */
  exact?: boolean;
  subItems?: NavSubItem[];
  /** Runs a server action instead of navigating. */
  action?: "open-console";
};

export type NavGroup = { id: string; label?: string; items: NavMainItem[] };

type Entry = { item: NavMainItem; sub?: NavSubItem; url: string; exact: boolean };

function entries(groups: readonly NavGroup[]): Entry[] {
  return groups.flatMap((g) =>
    g.items.flatMap<Entry>((item) => [
      ...(item.url ? [{ item, url: item.url, exact: item.exact === true }] : []),
      ...(item.subItems ?? []).map((sub) => ({ item, sub, url: sub.url, exact: false })),
    ]),
  );
}

function matches(pathname: string, { url, exact }: Entry) {
  return exact ? pathname === url : pathname === url || pathname.startsWith(`${url}/`);
}

/** The one entry that owns `pathname`: the longest matching url wins, so /admin/plans/new beats /admin/plans. */
export function findActive(groups: readonly NavGroup[], pathname: string): Entry | null {
  let best: Entry | null = null;
  for (const e of entries(groups)) if (matches(pathname, e) && (!best || e.url.length > best.url.length)) best = e;
  return best;
}

/** A top-level item is active when it, or one of its sub-items, owns the path. */
export function isItemActive(groups: readonly NavGroup[], pathname: string, item: NavMainItem) {
  return findActive(groups, pathname)?.item === item;
}

export function isSubActive(groups: readonly NavGroup[], pathname: string, sub: NavSubItem) {
  return findActive(groups, pathname)?.sub === sub;
}

/** Header title for a path; empty when the menu does not know the page. */
export function pageTitle(groups: readonly NavGroup[], pathname: string) {
  const active = findActive(groups, pathname);
  return active ? (active.sub?.title ?? active.item.title) : "";
}

/** Every href a menu links to (items and sub-items). */
export function navHrefs(groups: readonly NavGroup[]) {
  return entries(groups).map((e) => e.url);
}
