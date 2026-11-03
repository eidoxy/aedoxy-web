/**
 * Catalog contracts. UI code depends on these types only. Plans, fx and the
 * activity feed come from the aedoxy DB; models from New API GET /api/pricing
 * merged with model_meta (see ./index.ts, F05, F08).
 */

export type PlanPeriod = "weekly" | "monthly" | "custom";

/** Public pool status only, never exact stock (PRD section 11 item 6). */
export type StockStatus = "available" | "low" | "out";

export interface Plan {
  id: number;
  slug: string;
  name: string;
  tagline: string | null;
  period: PlanPeriod;
  /** Active window after payment. Weekly = 7, monthly = 30 (F03). */
  durationDays: number;
  /** Credit in USD (quota / quota_per_unit). Display only. */
  creditUsd: number;
  /** Flat price in whole rupiah. This is what the buyer pays. */
  priceIdr: number;
  /** Optional strike-through price in whole rupiah. */
  compareAtPriceIdr: number | null;
  badge: string | null;
  fairUse: boolean;
  stock: StockStatus;
  sortOrder: number;
}

export type Capability = "text" | "image" | "file" | "reasoning";
export type ModelStatus = "active" | "degraded" | "offline";

export interface Provider {
  /** Stable key, also used to pick the logo. */
  id: string;
  name: string;
}

export interface Model {
  /** Model name as sent in API requests. */
  id: string;
  providerId: string;
  contextIn: number | null;
  contextOut: number | null;
  capabilities: Capability[];
  status: ModelStatus;
  /** Provider list price, USD per 1M tokens. Null when unknown. */
  officialInputUsdPerM: number | null;
  officialOutputUsdPerM: number | null;
  /** What Aedoxy deducts from plan credit, USD per 1M tokens. Null when the model is not billed per token or the mode is not supported (see lib/model-cost.ts). */
  creditInputUsdPerM: number | null;
  creditOutputUsdPerM: number | null;
  /** Fixed credit per request in USD, for models billed per request. */
  creditPerRequestUsd: number | null;
  /** The credit price depends on the time of day (expression billing); the figure is the price at fetch time. */
  creditDynamic: boolean;
}

export interface ActivityItem {
  /** Masked display name, e.g. "R•••a". Never an email or an id. */
  label: string;
  /** Plan name, e.g. "Bulanan $20". No price, no promo code (F07). */
  plan: string;
  /** ISO timestamp. */
  at: string;
}

export interface FxRate {
  /** IDR per 1 USD. Display only (F04 / TRD D7). */
  rate: number;
  source: string;
  /** ISO date of the source quote. */
  sourceDate: string;
  fetchedAt: string;
  /** 1 or 100 (F04). */
  roundingStepIdr: number;
  /** Admin switch `fx_settings.show_conversion`. */
  showConversion: boolean;
}

/** Optional fields are hidden in the UI when absent; never invent them. */
export interface Stats {
  models: number;
  providers: number;
  plans: number;
  tokensProcessed?: number;
  developers?: number;
}

export interface Announcement {
  id: string;
  badge: string;
  text: string;
  href: string;
  linkLabel: string;
}

export interface RankingEntry {
  modelId: string;
  providerId: string;
  weeklyTokens: number;
  /** Week-over-week change in percent, null when not comparable. */
  changePct: number | null;
  isNew: boolean;
}
