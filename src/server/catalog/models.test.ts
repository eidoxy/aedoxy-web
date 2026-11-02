import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({ env: {} }));

import { creditCost } from "@/lib/model-cost";
import { outputPerPlan, sortModels } from "@/lib/models";
import type { NewApiPricing, PricingItem } from "@/server/integrations/newapi";
import { pricingBody } from "@/server/test/pricing-fixture";
import { buildCatalog, type MetaRow } from "./models";

const items = pricingBody.data.slice(0, 5) as unknown as PricingItem[];
const pricing: NewApiPricing = {
  items,
  vendors: new Map(pricingBody.vendors.map((v) => [v.id, v.name])),
  groupRatio: pricingBody.group_ratio,
  skipped: 1,
};
const item = (name: string) => items.find((i) => i.model_name === name)!;

describe("creditCost (formula from gateway-aedoxy text_quota.go)", () => {
  it("ratio mode: model_ratio x group x 2 per 1M input, x completion_ratio for output", () => {
    // gpt-4o: model_ratio 1.25 is "$2.5 / 1M tokens" in model_ratio.go, completion 4 => $10 out.
    expect(creditCost(item("gpt-4o"), pricing.groupRatio)).toEqual({ kind: "tokens", inputUsdPerM: 2.5, outputUsdPerM: 10 });
    expect(creditCost(item("claude-3-5-sonnet-20241022"), pricing.groupRatio)).toEqual({ kind: "tokens", inputUsdPerM: 3, outputUsdPerM: 15 });
  });

  it("applies the default group's ratio", () => {
    expect(creditCost(item("gpt-4o"), { default: 0.5 })).toEqual({ kind: "tokens", inputUsdPerM: 1.25, outputUsdPerM: 5 });
    expect(creditCost(item("gpt-4o"), {})).toMatchObject({ inputUsdPerM: 2.5 }); // unknown group costs x1, like GetGroupRatio
  });

  it("fixed price mode: model_price x group per request", () => {
    expect(creditCost(item("mj_imagine"), { default: 1.5 })).toEqual({ kind: "request", usdPerRequest: 0.15 });
  });

  it("does not convert billing expressions or models closed to the default group", () => {
    expect(creditCost(item("tiered-model"), pricing.groupRatio)).toEqual({ kind: "unsupported", reason: "billing expression" });
    expect(creditCost(item("vip-only"), pricing.groupRatio)).toMatchObject({ kind: "unsupported" });
  });

  it("rejects negative or unknown pricing instead of computing a wrong price", () => {
    expect(creditCost({ ...item("gpt-4o"), model_ratio: -1 }, pricing.groupRatio).kind).toBe("unsupported");
    expect(creditCost({ ...item("gpt-4o"), quota_type: 7 }, pricing.groupRatio).kind).toBe("unsupported");
    expect(creditCost(item("gpt-4o"), { default: -1 }).kind).toBe("unsupported");
  });
});

const meta = (over: Partial<MetaRow> = {}): MetaRow => ({
  modelName: "gpt-4o",
  provider: "openai",
  contextIn: 128_000,
  contextOut: 16_384,
  capabilities: ["text", "image", "bogus"],
  officialInputUsdPerM: "2.5000",
  officialOutputUsdPerM: "10.0000",
  visible: true,
  ...over,
});

describe("buildCatalog", () => {
  it("merges cost with model_meta, groups by provider and lists unsupported models with no price", () => {
    const { models, providers, unsupported } = buildCatalog(pricing, [meta()]);
    const gpt = models.find((m) => m.id === "gpt-4o")!;
    expect(gpt).toMatchObject({
      providerId: "openai",
      contextIn: 128_000,
      capabilities: ["text", "image"],
      officialInputUsdPerM: 2.5,
      officialOutputUsdPerM: 10,
      creditInputUsdPerM: 2.5,
      creditOutputUsdPerM: 10,
      creditPerRequestUsd: null,
    });
    // No meta: provider comes from the New API vendor, context and capabilities stay empty.
    expect(models.find((m) => m.id === "claude-3-5-sonnet-20241022")).toMatchObject({ providerId: "anthropic", contextIn: null, capabilities: [], officialInputUsdPerM: null });
    expect(models.find((m) => m.id === "mj_imagine")).toMatchObject({ creditInputUsdPerM: null, creditPerRequestUsd: 0.1 });
    expect(models.find((m) => m.id === "tiered-model")).toMatchObject({ creditInputUsdPerM: null, creditOutputUsdPerM: null, creditPerRequestUsd: null });
    expect(unsupported.map((u) => u.model)).toEqual(["tiered-model", "vip-only"]);
    expect(providers.map((p) => p.name)).toEqual(["Anthropic", "Midjourney", "OpenAI", "Lainnya"].sort((a, b) => a.localeCompare(b)));
  });

  it("hides models marked invisible and uses the admin's provider over the vendor", () => {
    const { models, providers } = buildCatalog(pricing, [meta({ visible: false }), meta({ modelName: "mj_imagine", provider: "Z.ai" })]);
    expect(models.some((m) => m.id === "gpt-4o")).toBe(false);
    expect(models.find((m) => m.id === "mj_imagine")?.providerId).toBe("z-ai");
    expect(providers.find((p) => p.id === "z-ai")?.name).toBe("Z.ai");
  });

  it("keeps a provider only while it has models", () => {
    const { providers } = buildCatalog({ ...pricing, items: [item("gpt-4o")] }, []);
    expect(providers).toEqual([{ id: "openai", name: "OpenAI" }]);
  });
});

describe("model list helpers with missing prices", () => {
  const { models } = buildCatalog(pricing, []);
  it("sorts models without a token price last in both directions", () => {
    const asc = sortModels(models, "price-asc").map((m) => m.id);
    const desc = sortModels(models, "price-desc").map((m) => m.id);
    expect(asc.slice(0, 2)).toEqual(["gpt-4o", "claude-3-5-sonnet-20241022"]);
    expect(desc.slice(0, 2)).toEqual(["claude-3-5-sonnet-20241022", "gpt-4o"]);
    expect(asc.slice(2).sort()).toEqual(desc.slice(2).sort());
  });
  it("estimates output per plan from credit / output price", () => {
    const gpt = models.find((m) => m.id === "gpt-4o")!;
    expect(outputPerPlan(gpt, 20)).toEqual({ unit: "token", count: 2_000_000 });
    expect(outputPerPlan(models.find((m) => m.id === "mj_imagine")!, 20)).toEqual({ unit: "request", count: 200 });
    expect(outputPerPlan(models.find((m) => m.id === "tiered-model")!, 20)).toBeNull();
  });
});
