import { describe, expect, it } from "vitest";
import { describeOrder, formatCountdown, secondsLeft, type FulfillmentStatus, type OrderStatus } from "./order-status";

describe("describeOrder", () => {
  const cases: [OrderStatus, FulfillmentStatus | null, string, boolean][] = [
    ["pending", null, "Menunggu pembayaran", false],
    ["paid", null, "Lunas, mengaktifkan paket", false],
    ["paid", "queued", "Lunas, mengaktifkan paket", false],
    ["paid", "retrying", "Lunas, mengaktifkan paket", false],
    ["paid", "succeeded", "Paket aktif", true],
    ["paid", "dead", "Lunas, aktivasi tertunda", true],
    ["expired", null, "Kedaluwarsa", true],
    ["cancelled", null, "Dibatalkan", true],
    ["failed", null, "Gagal dibuat", true],
    ["refunded", "succeeded", "Dikembalikan", true],
  ];
  it.each(cases)("%s + %s -> %s (final: %s)", (status, fulfillment, label, final) => {
    expect(describeOrder({ status, fulfillment })).toMatchObject({ label, final });
  });
});

describe("countdown", () => {
  it("formats minutes and seconds", () => {
    expect(formatCountdown(754)).toBe("12:34");
    expect(formatCountdown(0)).toBe("00:00");
    expect(formatCountdown(-5)).toBe("00:00");
  });
  it("never goes below zero", () => {
    const end = new Date("2026-01-01T00:15:00Z");
    expect(secondsLeft(end, Date.parse("2026-01-01T00:00:00Z"))).toBe(900);
    expect(secondsLeft(end, Date.parse("2026-01-01T00:20:00Z"))).toBe(0);
  });
});
