import { describe, expect, it } from "vitest";
import { categoryLabel, matchesTab, parsePeriodTab, planCategory, type PlanCategory } from "./plan-category";

type Fields = Parameters<typeof planCategory>[0];
const plan = (period: Fields["period"], durationUnit: Fields["durationUnit"], durationValue: number): Fields => ({ period, durationUnit, durationValue });

describe("planCategory", () => {
  const cases: [string, Fields, PlanCategory][] = [
    ["weekly period", plan("weekly", "day", 7), "weekly"],
    ["monthly period", plan("monthly", "day", 30), "monthly"],
    ["weekly period ignores the duration fields", plan("weekly", "hour", 1), "weekly"],
    ["custom 1 day", plan("custom", "day", 1), "daily"],
    ["custom 24 hours", plan("custom", "hour", 24), "daily"],
    ["custom 6 days", plan("custom", "day", 6), "daily"],
    ["custom 167 hours", plan("custom", "hour", 167), "daily"],
    ["custom 168 hours is 7 days", plan("custom", "hour", 168), "other"],
    ["custom 7 days", plan("custom", "day", 7), "other"],
    ["custom 14 days", plan("custom", "day", 14), "other"],
  ];
  it.each(cases)("%s -> %s", (_name, p, expected) => {
    expect(planCategory(p)).toBe(expected);
  });
});

describe("tabs", () => {
  it("'other' plans show only under Semua", () => {
    expect(matchesTab("other", "all")).toBe(true);
    for (const tab of ["daily", "weekly", "monthly"] as const) expect(matchesTab("other", tab)).toBe(false);
  });
  it("a category shows under Semua and its own tab only", () => {
    expect(matchesTab("weekly", "all")).toBe(true);
    expect(matchesTab("weekly", "weekly")).toBe(true);
    expect(matchesTab("weekly", "monthly")).toBe(false);
  });
  it("parses ?periode= and falls back to Semua", () => {
    expect(parsePeriodTab("weekly")).toBe("weekly");
    expect(parsePeriodTab("bogus")).toBe("all");
    expect(parsePeriodTab(undefined)).toBe("all");
    expect(parsePeriodTab(null)).toBe("all");
  });
  it("labels a short custom plan as Harian", () => {
    expect(categoryLabel(plan("custom", "day", 2))).toBe("Harian");
    expect(categoryLabel(plan("custom", "day", 20))).toBe("Kustom");
  });
});
