import { cacheLife } from "next/cache";
import { visibleActivity } from "@/lib/activity";
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

export async function getFxRate() {
  "use cache";
  cacheLife("hours");
  return source.getFxRate();
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

export async function getActivity() {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 600 });
  return visibleActivity(await source.getActivity(), Date.now());
}
