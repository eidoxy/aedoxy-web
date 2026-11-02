import { describe, expect, it } from "vitest";
import { describeOrder, formatCountdown, grantPhase, secondsLeft, type FulfillmentStatus, type GrantPhase, type OrderStatus } from "./order-status";

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

  const phases: [OrderStatus, FulfillmentStatus | null, GrantPhase | null, string, boolean][] = [
    ["paid", "succeeded", "active", "Paket aktif", true],
    ["paid", "succeeded", "replaced", "Digantikan paket baru", true],
    ["paid", "succeeded", "ended", "Berakhir", true],
    ["paid", "queued", "ended", "Lunas, mengaktifkan paket", false],
    ["paid", "retrying", "replaced", "Lunas, mengaktifkan paket", false],
    ["paid", "dead", "ended", "Lunas, aktivasi tertunda", true],
    ["pending", null, "active", "Menunggu pembayaran", false],
    ["refunded", "succeeded", "replaced", "Dikembalikan", true],
    ["cancelled", null, null, "Dibatalkan", true],
  ];
  it.each(phases)("%s + %s + grant %s -> %s (final: %s)", (status, fulfillment, grantPhase, label, final) => {
    expect(describeOrder({ status, fulfillment, grantPhase })).toMatchObject({ label, final });
  });
});

describe("grantPhase", () => {
  const now = Date.parse("2026-11-02T00:00:00Z");
  const future = "2026-11-10T00:00:00Z";
  const past = "2026-10-30T00:00:00Z";
  const cases: [string, Parameters<typeof grantPhase>[0], GrantPhase][] = [
    ["no grant row", null, "active"],
    ["running and not reconciled", { endsAt: future, reconciledAt: null, replaced: false }, "active"],
    ["past its end, not yet reconciled", { endsAt: past, reconciledAt: null, replaced: false }, "ended"],
    ["ends exactly now", { endsAt: new Date(now), reconciledAt: null, replaced: false }, "ended"],
    ["reconciled after its end", { endsAt: past, reconciledAt: "2026-10-31T00:00:00Z", replaced: false }, "ended"],
    ["reconciled early without replace flag", { endsAt: future, reconciledAt: "2026-11-01T00:00:00Z", replaced: false }, "ended"],
    ["replaced", { endsAt: future, reconciledAt: "2026-11-01T00:00:00Z", replaced: true }, "replaced"],
  ];
  it.each(cases)("%s -> %s", (_name, grant, expected) => {
    expect(grantPhase(grant, now)).toBe(expected);
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
