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

export const blendedCredit = (m: Model) => blend(m.creditInputUsdPerM, m.creditOutputUsdPerM);

export function sortModels(models: Model[], sort: ModelSort): Model[] {
  const copy = [...models];
  switch (sort) {
    case "price-asc":
      return copy.sort((a, b) => blendedCredit(a) - blendedCredit(b));
    case "price-desc":
      return copy.sort((a, b) => blendedCredit(b) - blendedCredit(a));
    case "context":
      return copy.sort((a, b) => (b.contextIn ?? 0) - (a.contextIn ?? 0));
    default:
      return copy.sort((a, b) => a.id.localeCompare(b.id));
  }
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
  if (official <= 0) return null;
  const pct = Math.round((1 - blendedCredit(m) / official) * 100);
  return pct > 0 ? pct : null;
}
