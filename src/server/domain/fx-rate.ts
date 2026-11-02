import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/server/db/client";
import { fxRates, fxSettings } from "@/server/db/schema";
import type { FxRate } from "@/server/catalog/types";
import { fetchErApi, fetchFrankfurter, type FxSample } from "@/server/integrations/fx";
import { AdminError, writeAudit, type Actor } from "./audit";

/**
 * Display rate (F04 / TRD D7). The rate only feeds the "≈ Rp" hints; nothing in
 * orders or pricing imports this module (a test greps for it).
 */

export const FX_MIN_IDR = 5_000;
export const FX_MAX_IDR = 50_000;
export const MANUAL_SOURCE = "Kurs manual (admin)";
/** After a refresh where no source answered, wait this long before asking again (not every worker tick). */
const FAILED_RETRY_MS = 60 * 60_000;

export type FxSettingsRow = typeof fxSettings.$inferSelect;
export type FxAlertKind = "out_of_range" | "divergence" | "stale" | "all_failed";
export type FxAlert = { kind: FxAlertKind; message: string };
export type FxSelection = {
  /** The rate to display; null only when nothing was ever fetched. */
  chosen: FxSample | null;
  /** True when `chosen` is one of the new samples (to be stored as applied), false when the previous rate stays. */
  isNew: boolean;
  alerts: FxAlert[];
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A quote dated D describes day D, so it ages from the end of that day (a Friday ECB quote is not stale on Monday morning). */
const ageHours = (s: { sourceDate: string }, now: Date) => (now.getTime() - (Date.parse(`${s.sourceDate}T00:00:00Z`) + DAY)) / HOUR;

/**
 * Pure F04 safety table. `prev` is the rate on display now, `samples` the fresh quotes (null = that source failed).
 *  - primary failed -> backup
 *  - quote outside 5.000-50.000 -> ignored + alert
 *  - sources differ by more than divergenceAlertPct -> primary + alert
 *  - no fresh quote (both failed, ignored, or older than staleAfterHours) -> keep the last rate + alert
 */
export function selectDisplayRate(
  prev: FxSample | null,
  samples: { primary: FxSample | null; backup: FxSample | null },
  settings: { staleAfterHours: number; divergenceAlertPct: number },
  now = new Date(),
): FxSelection {
  const alerts: FxAlert[] = [];
  const valid: FxSample[] = [];
  for (const s of [samples.primary, samples.backup]) {
    if (!s) continue;
    if (Number.isFinite(s.rate) && s.rate >= FX_MIN_IDR && s.rate <= FX_MAX_IDR) valid.push(s);
    else alerts.push({ kind: "out_of_range", message: `${s.source} mengirim kurs ${s.rate}, di luar rentang ${FX_MIN_IDR}-${FX_MAX_IDR}. Nilai diabaikan.` });
  }

  const fresh = valid.filter((s) => ageHours(s, now) <= settings.staleAfterHours);
  if (fresh.length > 0) {
    const chosen = fresh.find((s) => s === samples.primary) ?? fresh[0];
    const other = fresh.find((s) => s !== chosen);
    if (other && (Math.abs(chosen.rate - other.rate) / chosen.rate) * 100 > settings.divergenceAlertPct) {
      alerts.push({
        kind: "divergence",
        message: `${chosen.source} ${chosen.rate} dan ${other.source} ${other.rate} berbeda lebih dari ${settings.divergenceAlertPct}%. Memakai ${chosen.source}.`,
      });
    }
    return { chosen, isNew: true, alerts };
  }

  // Nothing fresh: keep what is on display (or a stale quote that is newer than it).
  const newest = [...valid].sort((a, b) => b.sourceDate.localeCompare(a.sourceDate))[0] ?? null;
  const useNew = newest !== null && (prev === null || newest.sourceDate > prev.sourceDate);
  const chosen = useNew ? newest : prev;
  alerts.push(
    valid.length > 0
      ? { kind: "stale", message: `Kurs terbaru bertanggal ${newest?.sourceDate}, lebih tua dari ${settings.staleAfterHours} jam.` }
      : { kind: "all_failed", message: "Kedua sumber kurs gagal atau ditolak. Kurs terakhir tetap dipakai." },
  );
  return { chosen, isNew: useNew, alerts };
}

// --- database side -------------------------------------------------------

/** Settings row, created with defaults on first use (safe to call from any reader). */
export async function getFxSettings(): Promise<FxSettingsRow> {
  await db.insert(fxSettings).values({ id: 1 }).onConflictDoNothing({ target: fxSettings.id });
  const [row] = await db.select().from(fxSettings).where(eq(fxSettings.id, 1));
  return row;
}

const toSample = (r: typeof fxRates.$inferSelect): FxSample => ({ source: r.source, rate: Number(r.midRate), sourceDate: r.sourceDate });

async function latestApplied() {
  const [row] = await db.select().from(fxRates).where(eq(fxRates.applied, true)).orderBy(desc(fxRates.fetchedAt), desc(fxRates.id)).limit(1);
  return row ?? null;
}

/** What the UI shows. Null when conversion has no rate yet; `showConversion=false` is passed through for the components to honour. */
export async function getDisplayFx(): Promise<FxRate | null> {
  const s = await getFxSettings();
  const base = { roundingStepIdr: s.roundingStepIdr, showConversion: s.showConversion };
  if (s.mode === "manual") {
    const rate = Number(s.manualRateIdr);
    if (!Number.isFinite(rate) || rate < FX_MIN_IDR || rate > FX_MAX_IDR) return null;
    return { ...base, rate, source: MANUAL_SOURCE, sourceDate: s.updatedAt.toISOString().slice(0, 10), fetchedAt: s.updatedAt.toISOString() };
  }
  const row = await latestApplied();
  return row ? { ...base, rate: Number(row.midRate), source: row.source, sourceDate: row.sourceDate, fetchedAt: row.fetchedAt.toISOString() } : null;
}

export type RefreshOutcome = FxSelection & { fetched: { primary: boolean; backup: boolean } };

/**
 * Fetches both sources, stores every quote (history for the 30-day chart) and
 * marks the chosen one as applied. Alerts go to the audit log as actor "system"
 * and to the log. Never throws for a source failure.
 */
export async function refreshFxRates(now = new Date(), deps = { primary: fetchFrankfurter, backup: fetchErApi }, actor?: Actor): Promise<RefreshOutcome> {
  const settings = await getFxSettings();
  const [p, b] = await Promise.allSettled([deps.primary(), deps.backup()]);
  const primary = p.status === "fulfilled" ? p.value : null;
  const backup = b.status === "fulfilled" ? b.value : null;
  for (const r of [p, b]) if (r.status === "rejected") console.warn("[fx] source failed", r.reason instanceof Error ? r.reason.message : "unknown");

  const prevRow = await latestApplied();
  const selection = selectDisplayRate(prevRow ? toSample(prevRow) : null, { primary, backup }, { staleAfterHours: settings.staleAfterHours, divergenceAlertPct: Number(settings.divergenceAlertPct) }, now);

  await db.transaction(async (tx) => {
    for (const s of [primary, backup]) {
      if (!s) continue;
      await tx.insert(fxRates).values({
        source: s.source,
        midRate: s.rate.toFixed(4),
        sourceDate: s.sourceDate,
        fetchedAt: now,
        applied: selection.isNew && selection.chosen === s,
      });
    }
    for (const a of selection.alerts) {
      await writeAudit(tx, { actor: { id: "system", ip: null }, action: "fx.alert", target: "fx", after: a });
    }
    // A manual refresh is an admin action: its audit row commits (or rolls back) with the stored quotes.
    if (actor) {
      await writeAudit(tx, {
        actor,
        action: "fx.refresh",
        target: "fx",
        after: { chosen: selection.chosen, fetched: { primary: primary !== null, backup: backup !== null }, alerts: selection.alerts.map((a) => a.kind) },
      });
    }
  });
  for (const a of selection.alerts) console.warn(`[fx] alert ${a.kind}: ${a.message}`);
  return { ...selection, fetched: { primary: primary !== null, backup: backup !== null } };
}

let lastFailedAt = 0;

/** Worker entry: refreshes when the newest stored quote is older than `refresh_hours`. */
export async function refreshFxIfDue(now = new Date()): Promise<"skipped" | "refreshed" | "failed"> {
  const settings = await getFxSettings();
  const [last] = await db.select({ at: fxRates.fetchedAt }).from(fxRates).orderBy(desc(fxRates.fetchedAt)).limit(1);
  if (last && now.getTime() - last.at.getTime() < settings.refreshHours * HOUR) return "skipped";
  if (now.getTime() - lastFailedAt < FAILED_RETRY_MS) return "skipped";
  const r = await refreshFxRates(now);
  if (!r.fetched.primary && !r.fetched.backup) {
    lastFailedAt = now.getTime();
    return "failed";
  }
  return "refreshed";
}

export type FxStatus = {
  settings: FxSettingsRow;
  display: FxRate | null;
  /** Newest stored quote per source. */
  bySource: { source: string; rate: number; sourceDate: string; fetchedAt: Date }[];
  nextRefreshAt: Date | null;
  /** Applied quotes of the last 30 days, one per source date, oldest first. */
  history: { date: string; rate: number }[];
};

export async function getFxStatus(now = new Date()): Promise<FxStatus> {
  const settings = await getFxSettings();
  const since = new Date(now.getTime() - 30 * DAY);
  const [recent, applied, display] = await Promise.all([
    db.select().from(fxRates).orderBy(desc(fxRates.fetchedAt), desc(fxRates.id)).limit(40),
    db.select().from(fxRates).where(and(eq(fxRates.applied, true), gte(fxRates.fetchedAt, since))).orderBy(fxRates.fetchedAt, fxRates.id),
    getDisplayFx(),
  ]);
  const seen = new Set<string>();
  const bySource = recent
    .filter((r) => (seen.has(r.source) ? false : (seen.add(r.source), true)))
    .map((r) => ({ source: r.source, rate: Number(r.midRate), sourceDate: r.sourceDate, fetchedAt: r.fetchedAt }));
  const byDate = new Map<string, number>();
  for (const r of applied) byDate.set(r.sourceDate, Number(r.midRate));
  return {
    settings,
    display,
    bySource,
    nextRefreshAt: recent[0] ? new Date(recent[0].fetchedAt.getTime() + settings.refreshHours * HOUR) : null,
    history: [...byDate].sort(([a], [b]) => a.localeCompare(b)).map(([date, rate]) => ({ date, rate })),
  };
}

export type FxSettingsInput = {
  mode: "manual" | "auto";
  manualRateIdr: number | null;
  refreshHours: number;
  roundingStepIdr: 1 | 100;
  showConversion: boolean;
};

export async function updateFxSettings(actor: Actor, input: FxSettingsInput) {
  if (input.mode === "manual" && (input.manualRateIdr === null || input.manualRateIdr < FX_MIN_IDR || input.manualRateIdr > FX_MAX_IDR)) {
    throw new AdminError(`Kurs manual harus antara Rp${FX_MIN_IDR.toLocaleString("id-ID")} dan Rp${FX_MAX_IDR.toLocaleString("id-ID")}.`);
  }
  if (!Number.isInteger(input.refreshHours) || input.refreshHours < 1 || input.refreshHours > 168) throw new AdminError("Interval pembaruan harus 1-168 jam.");
  await getFxSettings();
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(fxSettings).where(eq(fxSettings.id, 1)).for("update");
    const [after] = await tx
      .update(fxSettings)
      .set({
        mode: input.mode,
        manualRateIdr: input.manualRateIdr === null ? before.manualRateIdr : input.manualRateIdr.toFixed(4),
        refreshHours: input.refreshHours,
        roundingStepIdr: input.roundingStepIdr,
        showConversion: input.showConversion,
        updatedAt: new Date(),
      })
      .where(eq(fxSettings.id, 1))
      .returning();
    const pick = (r: FxSettingsRow) => ({ mode: r.mode, manualRateIdr: r.manualRateIdr, refreshHours: r.refreshHours, roundingStepIdr: r.roundingStepIdr, showConversion: r.showConversion });
    await writeAudit(tx, { actor, action: "fx.settings", target: "fx_settings:1", before: pick(before), after: pick(after) });
    return after;
  });
}

/** "Perbarui sekarang". Audited in the same transaction as the stored quotes; does not need a fresh 2FA code. */
export const adminRefreshFx = (actor: Actor) => refreshFxRates(new Date(), undefined, actor);
