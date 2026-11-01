import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";
import { visibleActivity } from "./activity";
import { discountPercent, formatAge, formatIdr, formatTokens, formatUsd } from "./format";
import { fxNote, usdToIdr } from "./fx";
import { filterModels, savingPercent } from "./models";
import type { ActivityItem, FxRate, Model } from "@/server/catalog/types";

const fx: FxRate = {
  rate: 18_148,
  source: "ECB",
  sourceDate: "2026-10-30",
  fetchedAt: "2026-11-01T06:00:00.000Z",
  roundingStepIdr: 1,
  showConversion: true,
};

const model = (over: Partial<Model> = {}): Model => ({
  id: "m",
  providerId: "p",
  contextIn: null,
  contextOut: null,
  capabilities: ["text"],
  status: "active",
  officialInputUsdPerM: 4,
  officialOutputUsdPerM: 4,
  creditInputUsdPerM: 1,
  creditOutputUsdPerM: 1,
  ...over,
});

describe("format", () => {
  it("formats money and tokens", () => {
    expect(formatIdr(25_000)).toBe("Rp25.000");
    expect(formatUsd(7)).toBe("$7");
    expect(formatUsd(0.3)).toBe("$0.30");
    expect(formatTokens(1_050_000)).toBe("1.05M");
    expect(formatTokens(128_000)).toBe("128K");
    expect(formatTokens(2_700_000_000)).toBe("2.7B");
  });
  it("formats relative age and discounts", () => {
    expect(formatAge(30_000)).toBe("baru saja");
    expect(formatAge(15 * 60_000)).toBe("15 menit lalu");
    expect(formatAge(3 * 3_600_000)).toBe("3 jam lalu");
    expect(discountPercent(55_000, 70_000)).toBe(21);
    expect(discountPercent(55_000, null)).toBeNull();
    expect(discountPercent(55_000, 55_000)).toBeNull();
  });
});

describe("fx (display only)", () => {
  it("converts and rounds to the configured step", () => {
    expect(usdToIdr(10, fx)).toBe(181_480);
    expect(usdToIdr(10, { ...fx, rate: 18_149, roundingStepIdr: 100 })).toBe(181_500);
  });
  it("describes the source", () => {
    expect(fxNote(fx)).toBe("Kurs Rp18.148 / $1, ECB, 30 Okt 2026");
  });
});

describe("models", () => {
  it("computes the blended saving, only when official prices exist", () => {
    expect(savingPercent(model())).toBe(75);
    expect(savingPercent(model({ officialInputUsdPerM: null }))).toBeNull();
    expect(savingPercent(model({ creditInputUsdPerM: 5, creditOutputUsdPerM: 5 }))).toBeNull();
  });
  it("filters by query, provider, capability and status", () => {
    const list = [
      model({ id: "alpha", providerId: "a" }),
      model({ id: "beta", providerId: "b", capabilities: ["text", "image"], status: "offline" }),
    ];
    const all = { query: "", providerId: "all", capability: "all", status: "all" } as const;
    expect(filterModels(list, all)).toHaveLength(2);
    expect(filterModels(list, { ...all, query: " ALP " }).map((m) => m.id)).toEqual(["alpha"]);
    expect(filterModels(list, { ...all, capability: "image" }).map((m) => m.id)).toEqual(["beta"]);
    expect(filterModels(list, { ...all, status: "offline", providerId: "b" })).toHaveLength(1);
  });
});

describe("activity feed rules (F07)", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const item = (hoursAgo: number): ActivityItem => ({
    label: "R•••a",
    plan: "Bulanan $20",
    at: new Date(now - hoursAgo * 3_600_000).toISOString(),
  });
  it("hides the feed below 3 fresh items", () => {
    expect(visibleActivity([item(1), item(2)], now)).toEqual([]);
  });
  it("drops items older than 7 days", () => {
    const out = visibleActivity([item(1), item(2), item(3), item(24 * 8)], now);
    expect(out).toHaveLength(3);
  });
});

describe("env", () => {
  it("accepts an empty template and applies defaults", () => {
    const env = parseEnv({ DATABASE_URL: "", BETTER_AUTH_SECRET: "" });
    expect(env.NEWAPI_PUBLIC_URL).toBe("https://ai.aedoxy.com");
    expect(env.DATABASE_URL).toBeUndefined();
  });
  it("rejects a malformed URL by variable name without echoing the value", () => {
    expect(() => parseEnv({ NEXT_PUBLIC_SITE_URL: "not a url" })).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
