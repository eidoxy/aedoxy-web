import { beforeEach, describe, expect, it, vi } from "vitest";
import { pricingBody } from "@/server/test/pricing-fixture";

const m = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  fetchPricing: vi.fn(),
  fetchExpressionPrices: vi.fn(),
}));

vi.mock("@/env", () => ({ env: {} }));
vi.mock("next/cache", () => ({ cacheLife: m.cacheLife, cacheTag: vi.fn() }));
vi.mock("@/server/db/client", () => ({ db: { select: () => ({ from: async () => [] }) } }));
vi.mock("@/server/db/schema", () => ({ modelMeta: {} }));
vi.mock("@/server/domain/activity", () => ({ getPublicActivity: vi.fn() }));
vi.mock("@/server/domain/fx-rate", () => ({ getDisplayFx: vi.fn() }));
vi.mock("@/server/site", () => ({ getAnnouncement: vi.fn() }));
vi.mock("./plans", () => ({ loadPlans: vi.fn() }));
vi.mock("@/server/integrations/newapi", async (orig) => ({
  ...(await orig<typeof import("@/server/integrations/newapi")>()),
  fetchPricing: m.fetchPricing,
  fetchExpressionPrices: m.fetchExpressionPrices,
}));

import { NewApiError, type PricingItem } from "@/server/integrations/newapi";
import { getCatalog } from "./index";

const pricing = (items: PricingItem[]) => ({ items, vendors: new Map<number, string>(), groupRatio: { default: 1 }, skipped: 0 });
const tiered = pricingBody.data[3] as unknown as PricingItem;

describe("getCatalog expression prices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("fills expression models from the gateway prices and caches for 10 minutes", async () => {
    m.fetchPricing.mockResolvedValue(pricing([tiered]));
    m.fetchExpressionPrices.mockResolvedValue(new Map([["tiered-model", { inputUsdPerM: 0.112, outputUsdPerM: 0.336, dynamic: true }]]));
    const c = await getCatalog();
    expect(c.state).toBe("ok");
    expect(c.models[0]).toMatchObject({ creditInputUsdPerM: 0.112, creditDynamic: true });
    expect(m.cacheLife).toHaveBeenCalledWith({ stale: 300, revalidate: 600, expire: 3600 });
  });

  it("keeps the catalog when the price route fails (old gateway 404): model shows no price", async () => {
    m.fetchPricing.mockResolvedValue(pricing([tiered]));
    m.fetchExpressionPrices.mockRejectedValue(new NewApiError("http", "Bridge returned HTTP 404", 404));
    const c = await getCatalog();
    expect(c.state).toBe("ok");
    expect(c.models[0]).toMatchObject({ id: "tiered-model", creditInputUsdPerM: null, creditDynamic: false });
    const warned = vi.mocked(console.warn).mock.calls.map((a) => a.join(" ")).join("\n");
    expect(warned).toContain("expression prices unavailable (HTTP 404): upgrade gateway");
  });

  it("uses a short cache window when the model list is empty", async () => {
    m.fetchPricing.mockResolvedValue(pricing([]));
    m.fetchExpressionPrices.mockResolvedValue(new Map());
    await getCatalog();
    expect(m.cacheLife).toHaveBeenCalledWith({ stale: 30, revalidate: 30, expire: 300 });
  });
});
