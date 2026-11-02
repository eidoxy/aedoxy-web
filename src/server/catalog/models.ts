import { creditCost } from "@/lib/model-cost";
import type { NewApiPricing } from "@/server/integrations/newapi";
import type { Capability, Model, Provider } from "./types";

/** Merge of New API's model list (cost) with the admin's model_meta (context, capabilities, official prices). */

export type MetaRow = {
  modelName: string;
  provider: string;
  contextIn: number | null;
  contextOut: number | null;
  capabilities: string[];
  /** Postgres numeric, so a string. */
  officialInputUsdPerM: string | null;
  officialOutputUsdPerM: string | null;
  visible: boolean;
};

export type BuiltCatalog = {
  models: Model[];
  providers: Provider[];
  /** Models whose cost could not be derived, with the reason. They are listed with "-". */
  unsupported: { model: string; reason: string }[];
};

const CAPABILITIES: readonly Capability[] = ["text", "image", "file", "reasoning"];

export const providerSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const num = (v: string | null) => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function buildCatalog(pricing: NewApiPricing, metas: MetaRow[]): BuiltCatalog {
  const metaByName = new Map(metas.map((m) => [m.modelName, m]));
  const providerNames = new Map<string, string>();
  const unsupported: BuiltCatalog["unsupported"] = [];
  const seen = new Set<string>();
  const models: Model[] = [];

  for (const item of pricing.items) {
    if (seen.has(item.model_name)) continue;
    seen.add(item.model_name);
    const meta = metaByName.get(item.model_name);
    if (meta && !meta.visible) continue;

    const vendorName = item.vendor_id === undefined ? undefined : pricing.vendors.get(item.vendor_id);
    const rawName = meta?.provider.trim() || vendorName || "Lainnya";
    const providerId = providerSlug(meta?.provider ?? "") || providerSlug(vendorName ?? "") || "lainnya";
    // A vendor's own spelling wins over whatever the admin typed for the same slug.
    if (vendorName !== undefined && providerSlug(vendorName) === providerId) providerNames.set(providerId, vendorName);
    else if (!providerNames.has(providerId)) providerNames.set(providerId, rawName);

    const cost = creditCost(item, pricing.groupRatio);
    if (cost.kind === "unsupported") unsupported.push({ model: item.model_name, reason: cost.reason });

    models.push({
      id: item.model_name,
      providerId,
      contextIn: meta?.contextIn ?? null,
      contextOut: meta?.contextOut ?? null,
      capabilities: (meta?.capabilities ?? []).filter((c): c is Capability => (CAPABILITIES as readonly string[]).includes(c)),
      // New API lists a model only while a channel serves it; it has no health signal beyond that.
      status: "active",
      officialInputUsdPerM: num(meta?.officialInputUsdPerM ?? null),
      officialOutputUsdPerM: num(meta?.officialOutputUsdPerM ?? null),
      creditInputUsdPerM: cost.kind === "tokens" ? cost.inputUsdPerM : null,
      creditOutputUsdPerM: cost.kind === "tokens" ? cost.outputUsdPerM : null,
      creditPerRequestUsd: cost.kind === "request" ? cost.usdPerRequest : null,
    });
  }

  const usedProviders = new Set(models.map((m) => m.providerId));
  const providers: Provider[] = [...providerNames]
    .filter(([id]) => usedProviders.has(id))
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { models, providers, unsupported };
}
