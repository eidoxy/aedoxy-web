import type { Capability, Model, ModelStatus } from "@/server/catalog/types";

export type ModelSort = "name" | "price-asc" | "price-desc" | "context";

export interface ModelFilter {
  query: string;
  providerId: string | "all";
  capability: Capability | "all";
  status: ModelStatus | "all";
}

export function filterModels(models: Model[], f: ModelFilter): Model[] {
  const q = f.query.trim().toLowerCase();
  return models.filter(
    (m) =>
      (q === "" || m.id.toLowerCase().includes(q)) &&
      (f.providerId === "all" || m.providerId === f.providerId) &&
      (f.capability === "all" || m.capabilities.includes(f.capability)) &&
      (f.status === "all" || m.status === f.status),
  );
}

/** Output-weighted blend assuming 3 input tokens per 1 output token. */
const blend = (input: number, output: number) => (3 * input + output) / 4;

/** Null for per-request and unsupported billing: there is no token price to blend. */
export const blendedCredit = (m: Model): number | null =>
  m.creditInputUsdPerM === null || m.creditOutputUsdPerM === null ? null : blend(m.creditInputUsdPerM, m.creditOutputUsdPerM);

/** Models without a token price sort last in both directions. */
const byCredit = (dir: 1 | -1) => (a: Model, b: Model) => {
  const x = blendedCredit(a);
  const y = blendedCredit(b);
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
  return dir * (x - y);
};

export function sortModels(models: Model[], sort: ModelSort): Model[] {
  const copy = [...models];
  switch (sort) {
    case "price-asc":
      return copy.sort(byCredit(1));
    case "price-desc":
      return copy.sort(byCredit(-1));
    case "context":
      return copy.sort((a, b) => (b.contextIn ?? 0) - (a.contextIn ?? 0));
    default:
      return copy.sort((a, b) => a.id.localeCompare(b.id));
  }
}

/**
 * What `creditUsd` of plan credit buys of this model if it were spent on output only: output tokens
 * (credit / output price per 1M), or requests for fixed-price models. Input tokens are billed from
 * the same credit, so real use gets fewer output tokens. Null when the price is unknown or zero.
 */
export function outputPerPlan(m: Model, creditUsd: number): { unit: "token" | "request"; count: number } | null {
  if (m.creditOutputUsdPerM !== null && m.creditOutputUsdPerM > 0) return { unit: "token", count: Math.floor((creditUsd / m.creditOutputUsdPerM) * 1_000_000) };
  if (m.creditPerRequestUsd !== null && m.creditPerRequestUsd > 0) return { unit: "request", count: Math.floor(creditUsd / m.creditPerRequestUsd) };
  return null;
}

/**
 * How much cheaper the plan credit cost is than the provider list price, in
 * percent, using the 3:1 input:output blend. Null when the official price is
 * unknown or not higher. Compares $ to $; the plan's rupiah price is not
 * part of this figure.
 */
export function savingPercent(m: Model): number | null {
  if (m.officialInputUsdPerM === null || m.officialOutputUsdPerM === null) return null;
  const official = blend(m.officialInputUsdPerM, m.officialOutputUsdPerM);
  const credit = blendedCredit(m);
  if (official <= 0 || credit === null) return null;
  const pct = Math.round((1 - credit / official) * 100);
  return pct > 0 ? pct : null;
}
