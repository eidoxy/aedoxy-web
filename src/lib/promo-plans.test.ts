import { describe, expect, it } from "vitest";
import { summarizePromoPlans } from "./promo-plans";

describe("summarizePromoPlans", () => {
  it("says every plan when the promo has no plan list", () => {
    expect(summarizePromoPlans([])).toEqual({ label: "Semua paket", all: true, names: [] });
  });

  it("counts the plans and keeps the full list for the popover", () => {
    expect(summarizePromoPlans(["Mingguan $5", "Bulanan $20", "Bulanan $50"])).toEqual({
      label: "3 paket",
      all: false,
      names: ["Mingguan $5", "Bulanan $20", "Bulanan $50"],
    });
    expect(summarizePromoPlans(["Satu"]).label).toBe("1 paket");
  });
});
