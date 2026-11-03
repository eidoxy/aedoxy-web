import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/server/db/client";
import { modelMeta } from "@/server/db/schema";
import { getPublicActivity } from "@/server/domain/activity";
import { getDisplayFx } from "@/server/domain/fx-rate";
import { fetchExpressionPrices, fetchPricing, NewApiError, type ExpressionPrice } from "@/server/integrations/newapi";
import { buildCatalog, type BuiltCatalog } from "./models";
import { loadPlans } from "./plans";
import type { Model, Plan, Provider, RankingEntry, Stats } from "./types";

export type * from "./types";

// F08: public pages are cached; models refresh every 10 minutes, plans/fx/activity sooner.

const warn = (what: string, err: unknown) => console.warn(`[catalog] ${what}`, err instanceof Error ? err.message : "unknown");

export async function getPlans(): Promise<Plan[]> {
  "use cache";
  cacheLife("minutes");
  try {
    return await loadPlans();
  } catch (err) {
    // Without a database the public pages still render, with no plans.
    warn("plans unavailable", err);
    return [];
  }
}

/** Optional input: a failure (e.g. an old gateway answering 404) only leaves expression models without a price. */
async function loadExpressionPrices(): Promise<Map<string, ExpressionPrice>> {
  try {
    return await fetchExpressionPrices();
  } catch (err) {
    const status = err instanceof NewApiError && err.status ? ` (HTTP ${err.status})` : "";
    const hint = err instanceof NewApiError && err.status === 404 ? ": upgrade gateway" : "";
    console.warn(`[catalog] expression prices unavailable${status}${hint}`, err instanceof Error ? err.message : "unknown");
    return new Map();
  }
}

export type Catalog = Pick<BuiltCatalog, "models" | "providers"> & {
  /** ok = fresh from New API; stale = New API unreachable, last good data shown; unavailable = nothing to show. */
  state: "ok" | "stale" | "unavailable";
};

// shortcut: last good catalog kept per process only (lost on restart); persist it if New API outages across restarts matter.
let lastGood: Pick<BuiltCatalog, "models" | "providers"> | null = null;

/**
 * Models + providers: New API GET /api/pricing merged with model_meta and the gateway's expression prices, refreshed
 * every 10 minutes (expression prices can follow the time of day). When New API cannot be reached the last good data
 * is returned, and a short cache window keeps the failure from sticking. /admin/models expires the "models" tag.
 */
export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheTag("models");
  try {
    const [pricing, metas, expressionPrices] = await Promise.all([fetchPricing(), db.select().from(modelMeta), loadExpressionPrices()]);
    const built = buildCatalog(pricing, metas, expressionPrices);
    if (pricing.skipped > 0) console.warn(`[catalog] ${pricing.skipped} pricing entries had an unexpected shape and were skipped`);
    if (built.unsupported.length > 0) {
      const reasons = [...new Set(built.unsupported.map((u) => u.reason))].join("; ");
      console.warn(`[catalog] credit cost not shown for ${built.unsupported.length} model(s): ${reasons}`);
    }
    lastGood = { models: built.models, providers: built.providers };
    // An empty list is almost always a transient New API state, so it must not stick for 10 minutes. expire >= 5 min, see below.
    cacheLife(built.models.length === 0 ? { stale: 30, revalidate: 30, expire: 300 } : { stale: 300, revalidate: 600, expire: 3600 });
    return { ...lastGood, state: "ok" };
  } catch (err) {
    warn("models unavailable", err);
    // expire must stay >= 5 min: shorter caches are excluded from prerender and fail the build when New API is down.
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    return lastGood ? { ...lastGood, state: "stale" } : { models: [], providers: [], state: "unavailable" };
  }
}

export async function getProviders(): Promise<Provider[]> {
  return (await getCatalog()).providers;
}

export async function getModels(): Promise<Model[]> {
  return (await getCatalog()).models;
}

/** Real data (fx_settings / fx_rates). /admin/fx expires the "fx" tag on every change. */
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

/** Counts only. No usage figures (tokens, developers) exist yet, so none are shown. */
export async function getStats(): Promise<Stats> {
  const [catalog, plans] = await Promise.all([getCatalog(), getPlans()]);
  return { models: catalog.models.length, providers: catalog.providers.length, plans: plans.length };
}

/** From /admin/settings. Hidden while switched off or incomplete, never invented text. */
export { getAnnouncement } from "@/server/site";

/** No usage data yet, so the rankings section stays hidden (UI-GUIDE section 7). */
export async function getRankings(): Promise<RankingEntry[]> {
  return [];
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
