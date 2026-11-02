import { describe, expect, it } from "vitest";
import { buildBuySummary, canContinue, durationLabel, type BuySummaryInput } from "./buy-summary";

const base: BuySummaryInput = {
  name: "Bulanan $20",
  period: "monthly",
  durationUnit: "day",
  durationValue: 30,
  creditQuota: 10_000_000,
  finalIdr: 55_000,
  strikeIdr: null,
  promo: null,
  active: null,
  pendingOrderId: null,
};

describe("buildBuySummary", () => {
  it("summarises a plain plan", () => {
    expect(buildBuySummary(base)).toEqual({
      name: "Bulanan $20",
      periodLabel: "Bulanan",
      validity: "30 hari sejak pembayaran",
      creditUsd: 20,
      finalIdr: 55_000,
      strikeIdr: null,
      discountIdr: 0,
      promoLabel: null,
      replace: null,
      pendingOrderId: null,
    });
  });

  it("shows the strike-through price, the discount and the promotion name", () => {
    const s = buildBuySummary({ ...base, finalIdr: 49_500, strikeIdr: 55_000, promo: { name: "Promo Nov", code: "HEMAT10", discountIdr: 5_500 } });
    expect(s).toMatchObject({ finalIdr: 49_500, strikeIdr: 55_000, discountIdr: 5_500, promoLabel: "Promo Nov (kode HEMAT10)" });
    expect(buildBuySummary({ ...base, promo: { name: "Otomatis", code: null, discountIdr: 1 } }).promoLabel).toBe("Otomatis");
  });

  it("drops a strike-through price that is not higher than the price to pay", () => {
    expect(buildBuySummary({ ...base, strikeIdr: 55_000 }).strikeIdr).toBeNull();
    expect(buildBuySummary({ ...base, strikeIdr: 40_000 }).strikeIdr).toBeNull();
  });

  it("describes the plan that would be replaced", () => {
    const active = { planName: "Mingguan $7", remainingQuota: 750_000, endsAt: "2026-11-07T00:00:00.000Z" };
    expect(buildBuySummary({ ...base, active }).replace).toEqual({ ...active, remainingUsd: 1.5 });
  });

  it("labels hour-based and short custom plans", () => {
    expect(durationLabel({ durationUnit: "hour", durationValue: 12 })).toBe("12 jam");
    expect(buildBuySummary({ ...base, period: "custom", durationValue: 2 }).periodLabel).toBe("Harian");
  });
});

describe("canContinue", () => {
  const idle = { replaceRequired: false, replaceConfirmed: false, pendingOrderId: null, busy: false };
  const cases: [string, Parameters<typeof canContinue>[0], boolean][] = [
    ["nothing in the way", idle, true],
    ["request in flight", { ...idle, busy: true }, false],
    ["plan sold out", { ...idle, disabled: true }, false],
    ["unpaid order exists", { ...idle, pendingOrderId: "o-1" }, false],
    ["replacement not confirmed", { ...idle, replaceRequired: true }, false],
    ["replacement confirmed", { ...idle, replaceRequired: true, replaceConfirmed: true }, true],
    ["confirmed but an unpaid order exists", { ...idle, replaceRequired: true, replaceConfirmed: true, pendingOrderId: "o-1" }, false],
    ["confirmed but busy", { ...idle, replaceRequired: true, replaceConfirmed: true, busy: true }, false],
  ];
  it.each(cases)("%s -> %s", (_name, state, expected) => {
    expect(canContinue(state)).toBe(expected);
  });
});
