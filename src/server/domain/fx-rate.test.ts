import { describe, expect, it } from "vitest";
import { selectDisplayRate } from "./fx-rate";

const NOW = new Date("2026-11-02T06:00:00Z");
const settings = { staleAfterHours: 72, divergenceAlertPct: 2 };
const frank = (rate: number, sourceDate = "2026-11-02") => ({ source: "ECB (Frankfurter)", rate, sourceDate });
const er = (rate: number, sourceDate = "2026-11-02") => ({ source: "ExchangeRate-API", rate, sourceDate });
const prev = { source: "ECB (Frankfurter)", rate: 18_000, sourceDate: "2026-10-30" };
const kinds = (r: ReturnType<typeof selectDisplayRate>) => r.alerts.map((a) => a.kind);

describe("selectDisplayRate: one test per row of the F04 safety table", () => {
  it("both sources fine and close: primary, no alert", () => {
    const p = frank(18_148);
    const r = selectDisplayRate(prev, { primary: p, backup: er(18_132) }, settings, NOW);
    expect(r).toMatchObject({ chosen: p, isNew: true, alerts: [] });
  });

  it("primary failed: uses the backup, still no alert", () => {
    const b = er(18_132);
    const r = selectDisplayRate(prev, { primary: null, backup: b }, settings, NOW);
    expect(r).toMatchObject({ chosen: b, isNew: true, alerts: [] });
  });

  it("both failed: keeps the last rate and alerts", () => {
    const r = selectDisplayRate(prev, { primary: null, backup: null }, settings, NOW);
    expect(r.chosen).toBe(prev);
    expect(r.isNew).toBe(false);
    expect(kinds(r)).toEqual(["all_failed"]);
  });

  it("both failed and nothing stored yet: no rate, alert", () => {
    const r = selectDisplayRate(null, { primary: null, backup: null }, settings, NOW);
    expect(r.chosen).toBeNull();
    expect(kinds(r)).toEqual(["all_failed"]);
  });

  it("data older than stale_after_hours: keeps the last rate and alerts", () => {
    // 2026-10-28 ends 2026-10-29T00:00Z, which is 78 h before NOW.
    const r = selectDisplayRate(prev, { primary: frank(18_100, "2026-10-28"), backup: er(18_100, "2026-10-28") }, settings, NOW);
    expect(r.chosen).toBe(prev);
    expect(r.isNew).toBe(false);
    expect(kinds(r)).toEqual(["stale"]);
  });

  it("stale data that is newer than the stored rate still replaces it, with an alert", () => {
    const old = { ...prev, sourceDate: "2026-10-20" };
    const s = frank(18_100, "2026-10-28");
    const r = selectDisplayRate(old, { primary: s, backup: null }, settings, NOW);
    expect(r).toMatchObject({ chosen: s, isNew: true });
    expect(kinds(r)).toEqual(["stale"]);
  });

  it("a Friday quote is not stale on Monday morning (weekend)", () => {
    const r = selectDisplayRate(prev, { primary: frank(18_148, "2026-10-30"), backup: null }, settings, NOW);
    expect(r.alerts).toEqual([]);
    expect(r.isNew).toBe(true);
  });

  it("sources differ by more than divergence_alert_pct: primary wins and alerts", () => {
    const p = frank(18_000);
    const r = selectDisplayRate(prev, { primary: p, backup: er(18_400) }, settings, NOW); // 2.2%
    expect(r.chosen).toBe(p);
    expect(kinds(r)).toEqual(["divergence"]);
  });

  it("exactly at the divergence limit does not alert", () => {
    const r = selectDisplayRate(prev, { primary: frank(18_000), backup: er(18_360) }, settings, NOW); // 2.0%
    expect(r.alerts).toEqual([]);
  });

  it.each([4_999, 50_001, 0, -1, Number.NaN])("a primary quote of %s is outside 5.000-50.000: ignored, backup used, alert", (bad) => {
    const b = er(18_132);
    const r = selectDisplayRate(prev, { primary: frank(bad), backup: b }, settings, NOW);
    expect(r.chosen).toBe(b);
    expect(kinds(r)).toEqual(["out_of_range"]);
  });

  it("the range limits themselves are accepted", () => {
    expect(selectDisplayRate(prev, { primary: frank(5_000), backup: null }, settings, NOW).alerts).toEqual([]);
    expect(selectDisplayRate(prev, { primary: frank(50_000), backup: null }, settings, NOW).alerts).toEqual([]);
  });

  it("both quotes out of range: the last rate stays, two range alerts plus the failure alert", () => {
    const r = selectDisplayRate(prev, { primary: frank(1), backup: er(999_999) }, settings, NOW);
    expect(r.chosen).toBe(prev);
    expect(kinds(r)).toEqual(["out_of_range", "out_of_range", "all_failed"]);
  });
});
