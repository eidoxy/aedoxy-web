import { describe, expect, it } from "vitest";
import { AmountOutOfRangeError, computeOrderAmount, generateTradeNo } from "./pricing";

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
