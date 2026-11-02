import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, fxRates, fxSettings, orders } from "@/server/db/schema";
import type { FxSample } from "@/server/integrations/fx";
import { installFakeServers, prepareDatabase, resetDatabase, seedPlan, seedPool, seedUser } from "@/server/test/helpers";
import { AdminError } from "./audit";
import { adminRefreshFx, getDisplayFx, getFxSettings, getFxStatus, refreshFxIfDue, refreshFxRates, updateFxSettings } from "./fx-rate";
import { createPlanOrder } from "./orders";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);
afterEach(() => vi.unstubAllGlobals());

const NOW = new Date("2026-11-02T06:00:00Z");
const frank = (rate: number, sourceDate = "2026-11-02"): FxSample => ({ source: "ECB (Frankfurter)", rate, sourceDate });
const er = (rate: number, sourceDate = "2026-11-02"): FxSample => ({ source: "ExchangeRate-API", rate, sourceDate });
const deps = (p: FxSample | Error, b: FxSample | Error) => ({
  primary: async () => {
    if (p instanceof Error) throw p;
    return p;
  },
  backup: async () => {
    if (b instanceof Error) throw b;
    return b;
  },
});
const admin = { id: "admin-1", ip: "203.0.113.9" };

describe("settings and display rate", () => {
  it("creates the single settings row with defaults on first read", async () => {
    const s = await getFxSettings();
    expect(s).toMatchObject({ id: 1, mode: "auto", refreshHours: 12, staleAfterHours: 72, showConversion: true, roundingStepIdr: 1 });
    await getFxSettings();
    expect(await db.select().from(fxSettings)).toHaveLength(1);
  });

  it("no rate yet -> null; after a refresh -> the primary quote", async () => {
    expect(await getDisplayFx()).toBeNull();
    await refreshFxRates(NOW, deps(frank(18_148), er(18_132)));
    expect(await getDisplayFx()).toMatchObject({ rate: 18_148, source: "ECB (Frankfurter)", sourceDate: "2026-11-02", showConversion: true, roundingStepIdr: 1 });
  });

  it("manual mode shows the admin rate and says so; auto keeps working underneath", async () => {
    await refreshFxRates(NOW, deps(frank(18_148), er(18_132)));
    await updateFxSettings(admin, { mode: "manual", manualRateIdr: 18_000, refreshHours: 12, roundingStepIdr: 100, showConversion: true });
    expect(await getDisplayFx()).toMatchObject({ rate: 18_000, source: "Kurs manual (admin)", roundingStepIdr: 100 });
    await updateFxSettings(admin, { mode: "auto", manualRateIdr: null, refreshHours: 12, roundingStepIdr: 1, showConversion: false });
    expect(await getDisplayFx()).toMatchObject({ rate: 18_148, showConversion: false });
  });

  it("rejects a manual rate outside 5.000-50.000 and a missing one; nothing is written", async () => {
    for (const bad of [null, 4_999, 50_001]) {
      await expect(updateFxSettings(admin, { mode: "manual", manualRateIdr: bad, refreshHours: 12, roundingStepIdr: 1, showConversion: true })).rejects.toBeInstanceOf(AdminError);
    }
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("a settings change writes one audit row with before and after", async () => {
    await updateFxSettings(admin, { mode: "auto", manualRateIdr: null, refreshHours: 6, roundingStepIdr: 100, showConversion: false });
    const [row] = await db.select().from(adminAuditLog);
    expect(row).toMatchObject({ actorId: "admin-1", action: "fx.settings", target: "fx_settings:1", ip: "203.0.113.9" });
    expect(row.before).toMatchObject({ refreshHours: 12, showConversion: true });
    expect(row.after).toMatchObject({ refreshHours: 6, roundingStepIdr: 100, showConversion: false });
  });
});

describe("refreshFxRates", () => {
  it("stores both quotes, applies only the chosen one", async () => {
    await refreshFxRates(NOW, deps(frank(18_148), er(18_132)));
    const rows = await db.select().from(fxRates).orderBy(fxRates.id);
    expect(rows.map((r) => [r.source, Number(r.midRate), r.applied])).toEqual([
      ["ECB (Frankfurter)", 18_148, true],
      ["ExchangeRate-API", 18_132, false],
    ]);
  });

  it("primary down -> the backup is applied and nothing alerts", async () => {
    await refreshFxRates(NOW, deps(new Error("down"), er(18_132)));
    const rows = await db.select().from(fxRates);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "ExchangeRate-API", applied: true });
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("both down -> the last rate stays and an alert is audited as actor system", async () => {
    await refreshFxRates(NOW, deps(frank(18_148), er(18_132)));
    const r = await refreshFxRates(new Date(NOW.getTime() + 12 * 3_600_000), deps(new Error("a"), new Error("b")));
    expect(r.alerts.map((a) => a.kind)).toEqual(["all_failed"]);
    expect(await getDisplayFx()).toMatchObject({ rate: 18_148 });
    expect(await db.select().from(fxRates)).toHaveLength(2);
    const [audit] = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "fx.alert"));
    expect(audit).toMatchObject({ actorId: "system", target: "fx" });
    expect(audit.after).toMatchObject({ kind: "all_failed" });
  });

  it("a quote outside the range is stored for history but never applied", async () => {
    await refreshFxRates(NOW, deps(frank(18_148), er(18_132)));
    await refreshFxRates(new Date(NOW.getTime() + 86_400_000), deps(frank(181), er(18_140, "2026-11-03")));
    expect(await getDisplayFx()).toMatchObject({ rate: 18_140, source: "ExchangeRate-API" });
  });

  it("the admin button audits in the same transaction and reports what happened", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("offline");
    });
    const r = await adminRefreshFx(admin);
    expect(r.fetched).toEqual({ primary: false, backup: false });
    const rows = await db.select().from(adminAuditLog).orderBy(adminAuditLog.id);
    expect(rows.map((x) => [x.actorId, x.action])).toEqual([
      ["system", "fx.alert"],
      ["admin-1", "fx.refresh"],
    ]);
  });
});

describe("refreshFxIfDue", () => {
  it("fetches when nothing is stored, then waits for refresh_hours", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      String(url).includes("frankfurter")
        ? new Response(JSON.stringify({ date: "2026-11-02", rates: { IDR: 18_148 } }))
        : new Response(JSON.stringify({ result: "success", time_last_update_unix: Math.floor(NOW.getTime() / 1000), rates: { IDR: 18_132 } })),
    );
    expect(await refreshFxIfDue(NOW)).toBe("refreshed");
    expect(await refreshFxIfDue(new Date(NOW.getTime() + 11 * 3_600_000))).toBe("skipped");
    expect(await refreshFxIfDue(new Date(NOW.getTime() + 13 * 3_600_000))).toBe("refreshed");
  });
});

describe("getFxStatus", () => {
  it("reports each source, the next refresh and a per-date history", async () => {
    await refreshFxRates(NOW, deps(frank(18_100, "2026-11-01"), er(18_090, "2026-11-01")));
    await refreshFxRates(new Date(NOW.getTime() + 12 * 3_600_000), deps(frank(18_148), er(18_132)));
    const s = await getFxStatus(new Date(NOW.getTime() + 13 * 3_600_000));
    expect(s.bySource.map((x) => [x.source, x.rate]).sort()).toEqual([
      ["ECB (Frankfurter)", 18_148],
      ["ExchangeRate-API", 18_132],
    ]);
    expect(s.history).toEqual([
      { date: "2026-11-01", rate: 18_100 },
      { date: "2026-11-02", rate: 18_148 },
    ]);
    expect(s.nextRefreshAt?.toISOString()).toBe("2026-11-03T06:00:00.000Z");
  });
});

describe("the rate never reaches an order amount (F04 'Selesai bila')", () => {
  it("pricing.ts and orders.ts do not import anything FX", () => {
    for (const file of ["pricing.ts", "orders.ts"]) {
      const src = readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
      const imports = src.split("\n").filter((l) => /^\s*(import|export)\b.*\bfrom\b/.test(l));
      expect(imports.filter((l) => /fx/i.test(l)), file).toEqual([]);
    }
  });

  it("createPlanOrder charges the same amount_idr whatever the rate and settings are", async () => {
    installFakeServers();
    await seedPool(100 * 500_000);
    const plan = await seedPlan({ priceIdr: 55_000, creditQuota: 20 * 500_000 });
    const amounts: number[] = [];
    for (const [mode, rate, rounding, show] of [["auto", 5_000, 1, true], ["manual", 50_000, 100, false], ["manual", 1, 100, true]] as const) {
      await getFxSettings();
      await db.update(fxSettings).set({ mode, manualRateIdr: String(rate), roundingStepIdr: rounding, showConversion: show });
      await db.insert(fxRates).values({ source: "x", midRate: String(rate * 1000), sourceDate: "2026-11-02", applied: true });
      const u = await seedUser();
      const { orderId } = await createPlanOrder({ userId: u.id, planId: plan.id });
      const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
      amounts.push(o.amountIdr);
    }
    expect(amounts).toEqual([55_000, 55_000, 55_000]);
  });
});
