import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import type { PlanInput } from "@/lib/schemas/plan";
import { db, type Tx } from "@/server/db/client";
import { orders, plans } from "@/server/db/schema";
import { listGroups } from "@/server/integrations/newapi";
import { AdminError, writeAudit, type Actor } from "./audit";
import { isPlanSynced } from "./plan-sellable";
import { syncPlan } from "./plan-sync";

/**
 * Admin side of plans (F05). Plans are never deleted, only disabled. Every
 * change and its audit row share one transaction. Fields mirrored in New API
 * bump `fields_version`; a plan is sellable only while `synced_version` matches
 * it (plan-sellable.ts), so a failed sync keeps the plan off sale.
 */

type PlanRow = typeof plans.$inferSelect;

/** Fields pushed to New API (plan-sync.ts). Price, compare-at price, badge, stock, sale window and display order are not. */
export const SYNCED_FIELDS = ["name", "subtitle", "durationUnit", "durationValue", "creditQuota", "upgradeGroup", "maxPurchasePerUser", "enabled"] as const;

export function syncedFieldsChanged(before: Pick<PlanRow, (typeof SYNCED_FIELDS)[number]>, after: Pick<PlanRow, (typeof SYNCED_FIELDS)[number]>): boolean {
  return SYNCED_FIELDS.some((k) => before[k] !== after[k]);
}

/** The admin-editable columns, for audit before/after. */
function editable(p: PlanRow) {
  return {
    name: p.name,
    subtitle: p.subtitle,
    badge: p.badge,
    period: p.period,
    durationUnit: p.durationUnit,
    durationValue: p.durationValue,
    creditQuota: p.creditQuota,
    priceIdr: p.priceIdr,
    compareAtPriceIdr: p.compareAtPriceIdr,
    upgradeGroup: p.upgradeGroup,
    maxPurchasePerUser: p.maxPurchasePerUser,
    stockLimit: p.stockLimit,
    saleStartsAt: p.saleStartsAt,
    saleEndsAt: p.saleEndsAt,
    enabled: p.enabled,
    sortOrder: p.sortOrder,
  };
}

function slugify(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "paket";
}

async function nextSortOrder(tx: Tx) {
  const [row] = await tx.select({ max: sql<number>`coalesce(max(${plans.sortOrder}), 0)`.mapWith(Number) }).from(plans);
  return row.max + 1;
}

async function insertPlan(tx: Tx, values: Omit<typeof plans.$inferInsert, "slug">) {
  const base = slugify(values.name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomUUID().slice(0, 6)}`;
    const [row] = await tx.insert(plans).values({ ...values, slug }).onConflictDoNothing({ target: plans.slug }).returning();
    if (row) return row;
  }
  throw new Error("Could not allocate a unique plan slug");
}

async function lockPlan(tx: Tx, id: number) {
  const [row] = await tx.select().from(plans).where(eq(plans.id, id)).for("update");
  if (!row) throw new AdminError("Paket tidak ditemukan.");
  return row;
}

/** A plan with a paid order. Changing its credit gives old and new buyers different contents under one name. */
async function hasPaidOrders(tx: Tx, planId: number) {
  const [row] = await tx.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(orders).where(and(eq(orders.planId, planId), eq(orders.status, "paid")));
  return row.n > 0;
}

/**
 * A changed, non-empty "group after purchase" must exist in the console. An unchanged value always passes
 * (the console may be down, or the group renamed there), and so does clearing it. `planId` is the plan being
 * edited, or the source of "save as new".
 */
export async function assertUpgradeGroupAllowed(next: string | null, planId?: number): Promise<void> {
  if (next === null) return;
  const [row] = planId ? await db.select({ group: plans.upgradeGroup }).from(plans).where(eq(plans.id, planId)) : [];
  if (next === (row?.group ?? null)) return;
  let groups: string[];
  try {
    groups = await listGroups();
  } catch {
    throw new AdminError("Daftar grup tidak bisa dimuat dari console, jadi grup belum bisa diubah. Simpan tanpa mengubah grup, atau coba lagi nanti.");
  }
  if (!groups.includes(next)) throw new AdminError(`Grup "${next}" tidak ada di console New API. Buat dulu di console, lalu pilih dari daftar.`);
}

export async function createPlan(actor: Actor, input: PlanInput): Promise<PlanRow> {
  return db.transaction(async (tx) => {
    const { sortOrder, ...rest } = input;
    const row = await insertPlan(tx, { ...rest, sortOrder: sortOrder ?? (await nextSortOrder(tx)) });
    await writeAudit(tx, { actor, action: "plan.create", target: `plan:${row.id}`, after: editable(row) });
    return row;
  });
}

export type UpdateResult = { plan: PlanRow; needsSync: boolean };

export async function updatePlan(actor: Actor, id: number, input: PlanInput, opts: { confirmCreditChange?: boolean } = {}): Promise<UpdateResult> {
  return db.transaction(async (tx) => {
    const before = await lockPlan(tx, id);
    if (input.creditQuota !== before.creditQuota && !opts.confirmCreditChange && (await hasPaidOrders(tx, id))) {
      throw new AdminError("Paket ini sudah pernah terjual. Konfirmasi perubahan kredit, atau simpan sebagai paket baru.", "CREDIT_CHANGE_NEEDS_CONFIRM");
    }
    const { sortOrder, ...rest } = input;
    const changed = syncedFieldsChanged(before, { ...before, ...rest });
    const [plan] = await tx
      .update(plans)
      .set({
        ...rest,
        sortOrder: sortOrder ?? before.sortOrder,
        ...(changed ? { fieldsVersion: sql`${plans.fieldsVersion} + 1` } : {}),
        updatedAt: new Date(),
      })
      .where(eq(plans.id, id))
      .returning();
    await writeAudit(tx, { actor, action: "plan.update", target: `plan:${id}`, before: editable(before), after: editable(plan) });
    return { plan, needsSync: changed };
  });
}

/** Flat price only: no sync, and pending orders keep the amount of their invoice. */
export async function setPlanPrice(actor: Actor, id: number, priceIdr: number): Promise<PlanRow> {
  return db.transaction(async (tx) => {
    const before = await lockPlan(tx, id);
    if (!Number.isSafeInteger(priceIdr) || priceIdr < 10_000 || priceIdr > 10_000_000) throw new AdminError("Harga flat harus antara Rp10.000 dan Rp10.000.000.");
    if (before.compareAtPriceIdr !== null && before.compareAtPriceIdr <= priceIdr) throw new AdminError("Harga flat harus lebih kecil dari harga coret. Ubah harga coret lewat form paket.");
    const [plan] = await tx.update(plans).set({ priceIdr, updatedAt: new Date() }).where(eq(plans.id, id)).returning();
    await writeAudit(tx, { actor, action: "plan.set_price", target: `plan:${id}`, before: { priceIdr: before.priceIdr }, after: { priceIdr } });
    return plan;
  });
}

export async function setPlanEnabled(actor: Actor, id: number, enabled: boolean): Promise<UpdateResult> {
  return db.transaction(async (tx) => {
    const before = await lockPlan(tx, id);
    if (before.enabled === enabled) return { plan: before, needsSync: false };
    const [plan] = await tx
      .update(plans)
      .set({ enabled, fieldsVersion: sql`${plans.fieldsVersion} + 1`, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    await writeAudit(tx, { actor, action: enabled ? "plan.enable" : "plan.disable", target: `plan:${id}`, before: { enabled: before.enabled }, after: { enabled } });
    return { plan, needsSync: true };
  });
}

/** Copy as a disabled draft: no sales, no console id, last in the list. */
export async function duplicatePlan(actor: Actor, id: number): Promise<PlanRow> {
  return db.transaction(async (tx) => {
    const src = await lockPlan(tx, id);
    const copy = await insertPlan(tx, { ...editable(src), name: `${src.name} (salinan)`.slice(0, 80), fairUse: src.fairUse, enabled: false, sortOrder: await nextSortOrder(tx) });
    await writeAudit(tx, { actor, action: "plan.duplicate", target: `plan:${copy.id}`, before: { sourcePlanId: id }, after: editable(copy) });
    return copy;
  });
}

/**
 * Swaps the plan with its neighbour in the displayed order. Returns the ids whose sort order changed.
 * Order is display-only (not a synced field), so `fields_version` stays put. Only the two swapped plans
 * are touched, unless two plans share a sort order: then everything is renumbered to repair the tie.
 */
export async function movePlan(actor: Actor, id: number, direction: "up" | "down"): Promise<number[]> {
  return db.transaction(async (tx) => {
    // Locks every plan row in a fixed order so two concurrent moves cannot interleave.
    const all = await tx.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.id)).for("update");
    const i = all.findIndex((p) => p.id === id);
    if (i === -1) throw new AdminError("Paket tidak ditemukan.");
    const j = direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= all.length) return [];

    const order = [...all];
    [order[i], order[j]] = [order[j], order[i]];
    const hasTie = all.some((p, k) => k > 0 && p.sortOrder === all[k - 1].sortOrder);
    const changedIds: number[] = [];
    for (const [idx, p] of order.entries()) {
      const sortOrder = hasTie ? idx + 1 : all[idx].sortOrder; // each position keeps its value; the plans trade places
      if (p.sortOrder === sortOrder) continue;
      await tx.update(plans).set({ sortOrder, updatedAt: new Date() }).where(eq(plans.id, p.id));
      changedIds.push(p.id);
    }
    await writeAudit(tx, { actor, action: "plan.move", target: `plan:${id}`, before: { order: all.map((p) => p.id) }, after: { order: order.map((p) => p.id), direction } });
    return changedIds;
  });
}

export type SyncOutcome = { id: number; ok: boolean };

/** After the transaction: pushes to New API. A failure is not an error here; the plan simply stays unsynced (and unsellable) until the hourly retry. */
export async function syncPlansBestEffort(ids: number[]): Promise<SyncOutcome[]> {
  const out: SyncOutcome[] = [];
  for (const id of ids) {
    const [p] = await db.select({ enabled: plans.enabled, newapiPlanId: plans.newapiPlanId }).from(plans).where(eq(plans.id, id));
    if (!p || (!p.enabled && p.newapiPlanId === null)) continue; // a disabled draft syncs once it is enabled
    try {
      await syncPlan(id);
      out.push({ id, ok: true });
    } catch (err) {
      console.error("[admin-plans] sync failed, plan stays unsynced", { id, error: err instanceof Error ? err.message : "unknown" });
      out.push({ id, ok: false });
    }
  }
  return out;
}

/**
 * After a reorder: pushes `sort_order` to New API for plans that are already in sync. Failures are logged
 * and change nothing. An unsynced plan is skipped; its next sync carries the current order.
 */
export async function pushSortOrdersBestEffort(ids: number[]): Promise<void> {
  for (const id of ids) {
    const [p] = await db.select().from(plans).where(eq(plans.id, id));
    if (!p || !isPlanSynced(p)) continue;
    try {
      await syncPlan(id); // same version in, same version out: the sync state does not move
    } catch (err) {
      console.error("[admin-plans] sort order push failed", { id, error: err instanceof Error ? err.message : "unknown" });
    }
  }
}

export type AdminPlanRow = PlanRow & { paidCount: number; revenueIdr: number; synced: boolean };

/** All plans in display order with paid order count and revenue (numbers only, no charts). */
export async function listAdminPlans(): Promise<AdminPlanRow[]> {
  const [rows, stats] = await Promise.all([
    db.select().from(plans).orderBy(asc(plans.sortOrder), asc(plans.id)),
    db
      .select({
        planId: orders.planId,
        n: sql<number>`count(*)`.mapWith(Number),
        revenue: sql<number>`coalesce(sum(${orders.amountIdr}), 0)`.mapWith(Number),
      })
      .from(orders)
      .where(eq(orders.status, "paid"))
      .groupBy(orders.planId),
  ]);
  const byPlan = new Map(stats.map((s) => [s.planId, s]));
  return rows.map((p) => ({ ...p, paidCount: byPlan.get(p.id)?.n ?? 0, revenueIdr: byPlan.get(p.id)?.revenue ?? 0, synced: isPlanSynced(p) }));
}

export async function getAdminPlan(id: number): Promise<AdminPlanRow | null> {
  return (await listAdminPlans()).find((p) => p.id === id) ?? null;
}
