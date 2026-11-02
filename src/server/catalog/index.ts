import { cacheLife, cacheTag } from "next/cache";
import { getPublicActivity } from "@/server/domain/activity";
import { getDisplayFx } from "@/server/domain/fx-rate";
import { mockCatalog } from "./mock";
import type { CatalogSource } from "./types";

export type * from "./types";

/** Swap this line for the real source when the DB and New API client exist. */
const source: CatalogSource = mockCatalog;

// F08: public pages are cached; models refresh hourly, plans/fx/activity sooner.

export async function getPlans() {
  "use cache";
  cacheLife("minutes");
  return source.getPlans();
}

export async function getProviders() {
  "use cache";
  cacheLife("hours");
  return source.getProviders();
}

export async function getModels() {
  "use cache";
  cacheLife("hours");
  return source.getModels();
}

/** Real data (fx_settings / fx_rates), not the mock. /admin/fx expires the "fx" tag on every change. */
export async function getFxRate() {
  "use cache";
  cacheLife("hours");
  cacheTag("fx");
  try {
    return await getDisplayFx();
  } catch (err) {
    // A rupiah hint is optional: without a database the public pages still render.
    console.warn("[fx] display rate unavailable", err instanceof Error ? err.message : "unknown");
    return null;
  }
}

export async function getStats() {
  "use cache";
  cacheLife("minutes");
  return source.getStats();
}

export async function getAnnouncement() {
  "use cache";
  cacheLife("minutes");
  return source.getAnnouncement();
}

export async function getRankings() {
  "use cache";
  cacheLife("hours");
  return source.getRankings();
}

/** Real feed (F07). Cached 30 s; opt-out and admin changes expire the "activity" tag. */
export async function getActivity() {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 600 });
  cacheTag("activity");
  try {
    return await getPublicActivity();
  } catch (err) {
    // The feed is optional: without a database the public pages still render.
    console.warn("[activity] feed unavailable", err instanceof Error ? err.message : "unknown");
    return [];
  }
}
