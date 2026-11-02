import { describe, expect, it } from "vitest";
import { parsePromoForm } from "./promo";

const base = { name: "Lebaran", kind: "percent", value: "15", code: "", startsAt: "", endsAt: "", maxRedemptions: "", perUserLimit: "1" };
const errors = (raw: Record<string, string>) => {
  const r = parsePromoForm(raw);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
};

describe("parsePromoForm", () => {
  it("accepts a minimal automatic percent promo", () => {
    const r = parsePromoForm(base);
    expect(r.success && r.data).toMatchObject({ name: "Lebaran", kind: "percent", value: 15, code: null, planIds: [], maxRedemptions: null, perUserLimit: 1, startsAt: null, endsAt: null });
  });

  it("reads plan checkboxes and WIB dates, and empty limits as unlimited", () => {
    const r = parsePromoForm({ ...base, code: "HEMAT-10", plan_5: "on", plan_2: "on", startsAt: "2026-11-10T00:00", endsAt: "2026-11-12T23:59", maxRedemptions: "100", perUserLimit: "" });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.planIds.sort()).toEqual([2, 5]);
    expect(r.data.startsAt?.toISOString()).toBe("2026-11-09T17:00:00.000Z");
    expect(r.data).toMatchObject({ code: "HEMAT-10", maxRedemptions: 100, perUserLimit: null });
  });

  it.each([
    ["percent 0", { value: "0" }, "value"],
    ["percent 91", { value: "91" }, "value"],
    ["fixed 0", { kind: "fixed", value: "0" }, "value"],
    ["fractional value", { value: "10.5" }, "value"],
    ["blank name", { name: "  " }, "name"],
    ["code with a space", { code: "a b" }, "code"],
    ["code over 32 characters", { code: "x".repeat(33) }, "code"],
    ["end before start", { startsAt: "2026-11-10T10:00", endsAt: "2026-11-10T09:00" }, "endsAt"],
    ["impossible date", { startsAt: "2026-02-31" }, "startsAt"],
    ["zero quota", { maxRedemptions: "0" }, "maxRedemptions"],
    ["unknown kind", { kind: "bogus" }, "kind"],
  ])("rejects %s", (_n, over, field) => {
    expect(errors({ ...base, ...over })).toHaveProperty(field);
  });

  it("accepts the limits: 1% and 90%, and a fixed amount", () => {
    for (const v of ["1", "90"]) expect(parsePromoForm({ ...base, value: v }).success).toBe(true);
    expect(parsePromoForm({ ...base, kind: "fixed", value: "5000" }).success).toBe(true);
  });
});
