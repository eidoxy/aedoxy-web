import { describe, expect, it } from "vitest";
import {
  AmountOutOfRangeError,
  chooseDiscount,
  computeOrderAmount,
  discountedAmount,
  generateTradeNo,
  promoRejection,
  type PromoRule,
} from "./pricing";

describe("computeOrderAmount", () => {
  it("charges the flat plan price with no discount", () => {
    expect(computeOrderAmount({ priceIdr: 55_000 })).toEqual({ listPriceIdr: 55_000, discountIdr: 0, amountIdr: 55_000 });
  });

  it("accepts the limits and rejects anything outside them", () => {
    expect(computeOrderAmount({ priceIdr: 10_000 }).amountIdr).toBe(10_000);
    expect(computeOrderAmount({ priceIdr: 10_000_000 }).amountIdr).toBe(10_000_000);
    for (const bad of [9_999, 10_000_001, 0, -1, 12_500.5, Number.NaN]) {
      expect(() => computeOrderAmount({ priceIdr: bad })).toThrow(AmountOutOfRangeError);
    }
  });
});

describe("discountedAmount: final = max(10.000, list - cut), rounded up to Rp100, never above the list price", () => {
  it.each([
    // [list, kind, value, discount, final]
    [55_000, "percent", 10, 5_500, 49_500],
    [55_000, "percent", 15, 8_200, 46_800], // 46.750 rounds up to 46.800
    [35_000, "percent", 33, 11_500, 23_500], // 23.450 rounds up
    [40_000, "fixed", 5_000, 5_000, 35_000],
    [40_000, "fixed", 5_050, 5_000, 35_000], // 34.950 rounds up to 35.000, so the cut shrinks to 5.000
    [55_000, "fixed", 1, 0, 55_000], // 54.999 rounds back up to the list price
    [20_000, "percent", 90, 10_000, 10_000], // 2.000 -> floor
    [20_000, "fixed", 15_000, 10_000, 10_000],
    [20_000, "fixed", 99_000_000, 10_000, 10_000], // cut larger than the price
    [10_000, "percent", 50, 0, 10_000], // already at the floor
    [10_050, "fixed", 10, 0, 10_050], // 10.040 rounds up to 10.100, above the list: capped
    [10_000_000, "percent", 90, 9_000_000, 1_000_000],
    [10_000_000, "percent", 1, 100_000, 9_900_000],
  ] as const)("%i %s %i -> cut %i, pays %i", (list, kind, value, discount, final) => {
    expect(discountedAmount(list, kind, value)).toEqual({ discountIdr: discount, amountIdr: final });
  });

  it("rejects values the admin form would never store", () => {
    for (const [kind, value] of [["percent", 0], ["percent", 91], ["percent", 10.5], ["fixed", 0], ["fixed", -5], ["fixed", Number.NaN]] as const) {
      expect(() => discountedAmount(55_000, kind, value)).toThrow(RangeError);
    }
    expect(() => discountedAmount(0, "fixed", 100)).toThrow(RangeError);
  });
});

const promo = (over: Partial<PromoRule> = {}): PromoRule => ({
  id: 1,
  name: "Promo",
  code: null,
  kind: "percent",
  value: 10,
  planIds: [],
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  redeemedCount: 0,
  perUserLimit: 1,
  enabled: true,
  ...over,
});

describe("chooseDiscount", () => {
  it("no promo: the flat price, no discount", () => {
    expect(chooseDiscount({ priceIdr: 55_000 }, [])).toMatchObject({ promo: null, listPriceIdr: 55_000, discountIdr: 0, amountIdr: 55_000 });
  });

  it("computes the cut from the flat price, never from a strike-through price", () => {
    const plan = { priceIdr: 55_000, compareAtPriceIdr: 70_000 };
    expect(chooseDiscount(plan, [promo()])).toMatchObject({ listPriceIdr: 55_000, discountIdr: 5_500, amountIdr: 49_500 });
  });

  it("one discount per order: the cheapest for the buyer, with the reason", () => {
    const pct = promo({ id: 1, name: "Sepuluh persen" }); // 5.500 off 55.000
    const fixed = promo({ id: 2, name: "Potongan 6rb", kind: "fixed", value: 6_000, code: "HEMAT" });
    const r = chooseDiscount({ priceIdr: 55_000 }, [pct, fixed]);
    expect(r.promo?.id).toBe(2);
    expect(r).toMatchObject({ discountIdr: 6_000, amountIdr: 49_000 });
    expect(r.reason).toContain("Potongan 6rb");
    expect(r.reason).toContain("paling menguntungkan dari 2");
  });

  it("a single applicable discount gets a plain reason", () => {
    expect(chooseDiscount({ priceIdr: 55_000 }, [promo({ name: "Lebaran" })]).reason).toBe('Diskon "Lebaran" berlaku.');
  });

  it("an exact tie goes to the lower id; zero-cut and corrupt promos are skipped", () => {
    const a = promo({ id: 7, kind: "fixed", value: 5_000 });
    const b = promo({ id: 3, kind: "fixed", value: 5_000 });
    expect(chooseDiscount({ priceIdr: 55_000 }, [a, b]).promo?.id).toBe(3);
    const none = chooseDiscount({ priceIdr: 10_000 }, [promo({ value: 50 }), promo({ id: 2, kind: "percent", value: 95 })]);
    expect(none.promo).toBeNull();
  });
});

describe("promoRejection", () => {
  const now = new Date("2026-11-10T00:00:00Z");
  const ctx = { planId: 5, now, userCount: 0 };
  const day = 86_400_000;

  it("usable promo -> null", () => {
    expect(promoRejection(promo(), ctx)).toBeNull();
    expect(promoRejection(promo({ planIds: [5, 6], maxRedemptions: 10, redeemedCount: 9, startsAt: new Date(+now - day), endsAt: new Date(+now + day) }), ctx)).toBeNull();
  });

  it.each([
    ["other plan", { planIds: [6] }, "PROMO_NOT_APPLICABLE"],
    ["stopped", { enabled: false }, "PROMO_EXPIRED"],
    ["ended", { endsAt: new Date(+now - 1) }, "PROMO_EXPIRED"],
    ["ends exactly now", { endsAt: now }, "PROMO_EXPIRED"],
    ["not started", { startsAt: new Date(+now + 1) }, "PROMO_NOT_STARTED"],
    ["quota used up", { maxRedemptions: 10, redeemedCount: 10 }, "PROMO_EXHAUSTED"],
    ["quota over", { maxRedemptions: 10, redeemedCount: 11 }, "PROMO_EXHAUSTED"],
  ] as [string, Partial<PromoRule>, string][])("%s -> %s", (_n, over, code) => {
    expect(promoRejection(promo(over), ctx)).toBe(code);
  });

  it("per-user limit counts reserved and used redemptions; null means no limit", () => {
    expect(promoRejection(promo({ perUserLimit: 1 }), { ...ctx, userCount: 1 })).toBe("PROMO_ALREADY_USED");
    expect(promoRejection(promo({ perUserLimit: 2 }), { ...ctx, userCount: 1 })).toBeNull();
    expect(promoRejection(promo({ perUserLimit: null }), { ...ctx, userCount: 99 })).toBeNull();
  });

  it("plan mismatch is reported before expiry (the buyer should learn it is the wrong plan)", () => {
    expect(promoRejection(promo({ planIds: [6], enabled: false }), ctx)).toBe("PROMO_NOT_APPLICABLE");
  });
});

describe("generateTradeNo", () => {
  it("uses ADX-<yyyymmdd>-<8 chars A-Z0-9> and satisfies the orders.trade_no check", () => {
    const no = generateTradeNo(new Date("2026-11-01T23:59:00Z"));
    expect(no).toMatch(/^ADX-20261101-[A-Z0-9]{8}$/);
    expect(no).toMatch(/^[A-Za-z0-9._:-]{1,64}$/);
  });

  it("does not repeat across many calls", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateTradeNo()));
    expect(seen.size).toBe(2000);
  });
});
