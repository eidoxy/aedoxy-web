/**
 * MOCK catalog. Every name, price, context size, count and timestamp here is
 * illustrative and must not be shown to real users. Plans mirror the example
 * table in docs/features/F05-admin-paket.md. Replace with the real source.
 */
import type {
  Capability,
  CatalogSource,
  Model,
  ModelStatus,
  Plan,
  Provider,
  RankingEntry,
} from "./types";

const providers: Provider[] = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "moonshot", name: "Moonshot AI" },
  { id: "zai", name: "Z.ai" },
  { id: "minimax", name: "MiniMax" },
  { id: "alibaba", name: "Alibaba" },
];

const T: Capability[] = ["text"];
const TI: Capability[] = ["text", "image"];
const TIF: Capability[] = ["text", "image", "file"];
const TR: Capability[] = ["text", "reasoning"];
const ALL: Capability[] = ["text", "image", "file", "reasoning"];

// [id, provider, ctxIn, ctxOut, caps, status, officialIn, officialOut, creditRatio]
type Row = [string, string, number, number, Capability[], ModelStatus, number, number, number];
const rows: Row[] = [
  ["gpt-5", "openai", 400_000, 128_000, ALL, "active", 1.25, 10, 0.6],
  ["gpt-5-mini", "openai", 400_000, 128_000, ALL, "active", 0.25, 2, 0.55],
  ["gpt-5-nano", "openai", 400_000, 128_000, TIF, "active", 0.05, 0.4, 0.55],
  ["gpt-4.1", "openai", 1_047_576, 32_768, TIF, "active", 2, 8, 0.65],
  ["claude-opus-4-1", "anthropic", 200_000, 32_000, ALL, "active", 15, 75, 0.7],
  ["claude-sonnet-4-5", "anthropic", 200_000, 64_000, ALL, "active", 3, 15, 0.6],
  ["claude-haiku-4-5", "anthropic", 200_000, 64_000, ALL, "degraded", 1, 5, 0.6],
  ["gemini-2.5-pro", "google", 1_048_576, 65_536, ALL, "active", 1.25, 10, 0.6],
  ["gemini-2.5-flash", "google", 1_048_576, 65_536, ALL, "active", 0.3, 2.5, 0.55],
  ["gemini-2.5-flash-lite", "google", 1_048_576, 65_536, TIF, "active", 0.1, 0.4, 0.55],
  ["deepseek-chat", "deepseek", 128_000, 8_000, T, "active", 0.28, 0.42, 0.8],
  ["deepseek-reasoner", "deepseek", 128_000, 64_000, TR, "active", 0.28, 0.42, 0.8],
  ["kimi-k2", "moonshot", 256_000, 16_000, T, "active", 0.6, 2.5, 0.7],
  ["glm-4.6", "zai", 200_000, 128_000, TR, "active", 0.6, 2.2, 0.7],
  ["minimax-m2", "minimax", 204_800, 128_000, TR, "active", 0.3, 1.2, 0.7],
  ["qwen3-coder-plus", "alibaba", 1_000_000, 65_536, T, "active", 1, 5, 0.7],
  ["qwen3-vl-plus", "alibaba", 262_144, 32_768, TI, "offline", 0.2, 1.6, 0.7],
];

const round3 = (n: number) => Math.round(n * 1000) / 1000;

const models: Model[] = rows.map(
  ([id, providerId, contextIn, contextOut, capabilities, status, offIn, offOut, ratio]) => ({
    id,
    providerId,
    contextIn,
    contextOut,
    capabilities,
    status,
    officialInputUsdPerM: offIn,
    officialOutputUsdPerM: offOut,
    creditInputUsdPerM: round3(offIn * ratio),
    creditOutputUsdPerM: round3(offOut * ratio),
  }),
);

const plans: Plan[] = [
  { id: 1, slug: "mingguan-5", name: "Mingguan", tagline: "Untuk mencoba", period: "weekly", durationDays: 7, creditUsd: 5, priceIdr: 20_000, compareAtPriceIdr: null, badge: null, fairUse: false, stock: "available", sortOrder: 1 },
  { id: 2, slug: "mingguan-7", name: "Mingguan", tagline: "Untuk proyek kecil", period: "weekly", durationDays: 7, creditUsd: 7, priceIdr: 25_000, compareAtPriceIdr: null, badge: "Terlaris", fairUse: false, stock: "available", sortOrder: 2 },
  { id: 3, slug: "mingguan-11", name: "Mingguan", tagline: "Untuk pemakaian rutin", period: "weekly", durationDays: 7, creditUsd: 11, priceIdr: 35_000, compareAtPriceIdr: null, badge: null, fairUse: false, stock: "low", sortOrder: 3 },
  { id: 4, slug: "bulanan-10", name: "Bulanan", tagline: "Untuk pemakaian ringan", period: "monthly", durationDays: 30, creditUsd: 10, priceIdr: 40_000, compareAtPriceIdr: null, badge: null, fairUse: false, stock: "available", sortOrder: 4 },
  { id: 5, slug: "bulanan-20", name: "Bulanan", tagline: "Untuk coding agent harian", period: "monthly", durationDays: 30, creditUsd: 20, priceIdr: 55_000, compareAtPriceIdr: 70_000, badge: "Promo", fairUse: false, stock: "available", sortOrder: 5 },
  { id: 6, slug: "bulanan-40", name: "Bulanan", tagline: "Untuk tim kecil", period: "monthly", durationDays: 30, creditUsd: 40, priceIdr: 100_000, compareAtPriceIdr: null, badge: null, fairUse: false, stock: "available", sortOrder: 6 },
];

const rankings: RankingEntry[] = [
  { modelId: "kimi-k2", providerId: "moonshot", weeklyTokens: 2_700_000_000, changePct: 80, isNew: false },
  { modelId: "deepseek-chat", providerId: "deepseek", weeklyTokens: 2_600_000_000, changePct: 50, isNew: false },
  { modelId: "glm-4.6", providerId: "zai", weeklyTokens: 1_500_000_000, changePct: null, isNew: true },
];

export const mockCatalog: CatalogSource = {
  async getPlans() {
    return plans;
  },
  async getProviders() {
    return providers;
  },
  async getModels() {
    return models;
  },
  async getFxRate() {
    return {
      rate: 18_148,
      source: "ECB (Frankfurter)",
      sourceDate: "2026-10-30",
      fetchedAt: "2026-11-01T06:00:00.000Z",
      roundingStepIdr: 1,
      showConversion: true,
    };
  },
  async getStats() {
    // No tokensProcessed / developers: there is no real data for them yet.
    return { models: models.length, providers: providers.length, plans: plans.length };
  },
  async getAnnouncement() {
    return {
      id: "mock-plans-1",
      badge: "Baru",
      text: "Paket mingguan dan bulanan kini tersedia.",
      href: "/pricing",
      linkLabel: "Lihat paket",
    };
  },
  async getRankings() {
    return rankings;
  },
};
