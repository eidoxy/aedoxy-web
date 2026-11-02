import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pricingBody } from "@/server/test/pricing-fixture";

const mockEnv = vi.hoisted(() => ({}) as { NEWAPI_INTERNAL_URL?: string; NEWAPI_PUBLIC_URL: string; NEWAPI_BRIDGE_TOKEN?: string });
vi.mock("@/env", () => ({ env: mockEnv }));

import { fetchPricing, NewApiError } from "./newapi";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("fetchPricing", () => {
  beforeEach(() => {
    mockEnv.NEWAPI_INTERNAL_URL = "http://newapi.internal:3000";
    mockEnv.NEWAPI_PUBLIC_URL = "https://ai.example.test";
    mockEnv.NEWAPI_BRIDGE_TOKEN = "sk-test-bridge-token-123";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads the list anonymously, skips malformed entries, and maps vendors and group ratios", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(pricingBody));
    vi.stubGlobal("fetch", fetchMock);

    const pricing = await fetchPricing();

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://newapi.internal:3000/api/pricing");
    expect(JSON.stringify(init)).not.toContain("sk-test-bridge-token-123"); // public endpoint: no service-account token
    expect(pricing.items.map((i) => i.model_name)).toEqual(["gpt-4o", "claude-3-5-sonnet-20241022", "mj_imagine", "tiered-model", "vip-only"]);
    expect(pricing.skipped).toBe(1);
    expect(pricing.vendors.get(2)).toBe("Anthropic");
    expect(pricing.groupRatio).toEqual({ default: 1, vip: 0.8 });
  });

  it("keeps a model whose enable_groups is null (Go nil slice) with an empty list", async () => {
    const item = { model_name: "m", quota_type: 0, model_ratio: 1, model_price: 0, completion_ratio: 1, enable_groups: null };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: true, data: [item] })));
    const pricing = await fetchPricing();
    expect(pricing.skipped).toBe(0);
    expect(pricing.items[0].enable_groups).toEqual([]);
  });

  it("falls back to the public URL when no internal URL is set", async () => {
    mockEnv.NEWAPI_INTERNAL_URL = undefined;
    const fetchMock = vi.fn().mockResolvedValue(json({ success: true, data: [] }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchPricing()).items).toEqual([]);
    expect(String((fetchMock.mock.calls[0] as [URL])[0])).toBe("https://ai.example.test/api/pricing");
  });

  it("maps timeout, network failure, HTTP error, rejection and bad bodies to typed errors", async () => {
    const kind = async () => {
      try {
        await fetchPricing();
        return "none";
      } catch (err) {
        return (err as NewApiError).kind;
      }
    };

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("t"), { name: "TimeoutError" })));
    expect(await kind()).toBe("timeout");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    expect(await kind()).toBe("network");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 503)));
    expect(await kind()).toBe("http");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: false, message: "no" })));
    expect(await kind()).toBe("rejected");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    expect(await kind()).toBe("invalid_response");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: true, data: "nope" })));
    expect(await kind()).toBe("invalid_response");
  });
});
