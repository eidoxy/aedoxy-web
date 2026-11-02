import { describe, expect, it } from "vitest";
import { parsePlanForm, planToFormValues } from "./plan";

const valid = { name: "Bulanan $20", period: "monthly", creditUsd: "20", priceIdr: "55000", maxPurchasePerUser: "0", enabled: "on" };

function errors(raw: Record<string, string>) {
  const r = parsePlanForm(raw);
  expect(r.success).toBe(false);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
}

describe("parsePlanForm", () => {
  it("accepts a minimal monthly plan and converts dollars to quota", () => {
    const r = parsePlanForm(valid);
    expect(r.success && r.data).toMatchObject({
      name: "Bulanan $20",
      period: "monthly",
      durationUnit: "day",
      durationValue: 30,
      creditQuota: 10_000_000,
      priceIdr: 55_000,
      compareAtPriceIdr: null,
      stockLimit: null,
      enabled: true,
      sortOrder: null,
    });
  });

  it("maps weekly to 7 days and custom to the given unit and value", () => {
    expect(parsePlanForm({ ...valid, period: "weekly" })).toMatchObject({ success: true, data: { durationUnit: "day", durationValue: 7 } });
    expect(parsePlanForm({ ...valid, period: "custom", customUnit: "hour", customValue: "36" })).toMatchObject({ success: true, data: { durationUnit: "hour", durationValue: 36 } });
  });

  it("converts fractional dollars without float drift", () => {
    expect(parsePlanForm({ ...valid, creditUsd: "0.07" })).toMatchObject({ success: true, data: { creditQuota: 35_000 } });
  });

  it("requires a duration for the custom period", () => {
    expect(errors({ ...valid, period: "custom" }).customValue).toMatch(/durasi/i);
  });

  it("holds the flat price to Rp10.000 to Rp10.000.000 whole rupiah", () => {
    expect(errors({ ...valid, priceIdr: "9999" }).priceIdr).toBeDefined();
    expect(errors({ ...valid, priceIdr: "10000001" }).priceIdr).toBeDefined();
    expect(errors({ ...valid, priceIdr: "55000.5" }).priceIdr).toBeDefined();
    expect(errors({ ...valid, priceIdr: "" }).priceIdr).toBeDefined();
    expect(parsePlanForm({ ...valid, priceIdr: "10000" }).success).toBe(true);
  });

  it("requires the compare-at price to be above the flat price", () => {
    expect(errors({ ...valid, compareAtPriceIdr: "55000" }).compareAtPriceIdr).toBeDefined();
    expect(errors({ ...valid, compareAtPriceIdr: "40000" }).compareAtPriceIdr).toBeDefined();
    expect(parsePlanForm({ ...valid, compareAtPriceIdr: "70000" })).toMatchObject({ success: true, data: { compareAtPriceIdr: 70_000 } });
  });

  it("rejects non-positive credit, an empty name and a missing period", () => {
    expect(errors({ ...valid, creditUsd: "0" }).creditUsd).toBeDefined();
    expect(errors({ ...valid, creditUsd: "-5" }).creditUsd).toBeDefined();
    expect(errors({ ...valid, name: "   " }).name).toBeDefined();
    expect(errors({ ...valid, period: "" }).period).toBeDefined();
  });

  it("reads the sale window as WIB and requires the end after the start", () => {
    const r = parsePlanForm({ ...valid, saleStartsAt: "2026-11-02T00:00", saleEndsAt: "2026-11-03T00:00" });
    expect(r.success && r.data.saleStartsAt?.toISOString()).toBe("2026-11-01T17:00:00.000Z");
    expect(errors({ ...valid, saleStartsAt: "2026-11-03T00:00", saleEndsAt: "2026-11-02T00:00" }).saleEndsAt).toBeDefined();
    expect(errors({ ...valid, saleStartsAt: "2026-02-31T00:00" }).saleStartsAt).toBeDefined();
  });

  it("treats an unchecked box as disabled and blank stock as unlimited", () => {
    const rest: Record<string, string> = { ...valid };
    delete rest.enabled;
    expect(parsePlanForm({ ...rest, stockLimit: "" })).toMatchObject({ success: true, data: { enabled: false, stockLimit: null } });
    expect(parsePlanForm({ ...valid, stockLimit: "0" })).toMatchObject({ success: true, data: { stockLimit: 0 } });
  });

  it("round-trips a stored plan through the form values", () => {
    const stored = parsePlanForm({ ...valid, subtitle: "30 hari", badge: "Terlaris", stockLimit: "50", upgradeGroup: "vip" });
    if (!stored.success) throw new Error("setup failed");
    const again = parsePlanForm({ ...planToFormValues({ ...stored.data, sortOrder: 0 }), enabled: "on" });
    expect(again).toMatchObject({ success: true, data: { ...stored.data, sortOrder: 0 } });
  });
});
