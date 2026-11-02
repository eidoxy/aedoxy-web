import { and, desc, eq, gte, inArray, notInArray, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { ACTIVITY_WINDOW_MS, pickActivityRows, toActivityItem, visibleActivity, type ActivityRow } from "@/lib/activity";
import { formatUsd, QUOTA_PER_USD } from "@/lib/format";
import { PERIOD_LABEL } from "@/lib/plans";
import { db, type Tx } from "@/server/db/client";
import { fulfillments, orders, siteSettings, user } from "@/server/db/schema";
import type { ActivityItem } from "@/server/catalog/types";
import { AdminError, writeAudit, type Actor } from "./audit";

/**
 * F07 activity feed. Source: paid orders whose plan activation succeeded, from
 * users who have not opted out. No fake rows. Admin controls live in the
 * site_settings row "activity".
 */

const KEY = "activity";
/** Newest paid rows read per request; one buyer with many orders cannot crowd the 20-item feed out of this window. */
const ROW_LIMIT = 200;
const HIDDEN_LIMIT = 500;

const settingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** null = every plan may appear. */
  planIds: z.array(z.number().int()).nullable().default(null),
  hiddenOrderIds: z.array(z.string()).default([]),
});
export type ActivitySettings = z.infer<typeof settingsSchema>;

export async function getActivitySettings(executor: Pick<typeof db, "select"> = db): Promise<ActivitySettings> {
  const [row] = await executor.select().from(siteSettings).where(eq(siteSettings.key, KEY));
  const parsed = settingsSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : settingsSchema.parse({});
}

async function writeSettings(tx: Tx, value: ActivitySettings) {
  await tx
    .insert(siteSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: siteSettings.key, set: { value, updatedAt: new Date() } });
}

/** "Bulanan $20" from the order's own plan data; a custom period keeps the plan name. */
function planLabel(snapshot: unknown, creditQuota: number): string {
  const s = (snapshot ?? {}) as { name?: unknown; period?: unknown };
  if (s.period === "weekly" || s.period === "monthly") return `${PERIOD_LABEL[s.period]} ${formatUsd(creditQuota / QUOTA_PER_USD)}`;
  return typeof s.name === "string" && s.name ? s.name : "Paket";
}

export type AdminActivityRow = ActivityRow & { orderId: string };

/** Newest first, already filtered by the admin's plan choice, hidden items and opt-outs. Not yet one per user. */
async function listRows(settings: ActivitySettings, now: Date): Promise<AdminActivityRow[]> {
  const conds: SQL[] = [
    eq(orders.status, "paid"),
    eq(fulfillments.status, "succeeded"),
    eq(user.showActivity, true),
    gte(orders.paidAt, new Date(now.getTime() - ACTIVITY_WINDOW_MS)),
  ];
  if (settings.planIds !== null) conds.push(settings.planIds.length > 0 ? inArray(orders.planId, settings.planIds) : sql`false`);
  if (settings.hiddenOrderIds.length > 0) conds.push(notInArray(orders.id, settings.hiddenOrderIds));

  const rows = await db
    .select({
      orderId: orders.id,
      userId: orders.userId,
      name: user.name,
      snapshot: orders.planSnapshot,
      creditQuota: orders.creditQuota,
      paidAt: orders.paidAt,
    })
    .from(orders)
    .innerJoin(fulfillments, eq(fulfillments.orderId, orders.id))
    .innerJoin(user, eq(user.id, orders.userId))
    .where(and(...conds))
    .orderBy(desc(orders.paidAt))
    .limit(ROW_LIMIT);

  return rows.flatMap((r) =>
    r.paidAt ? [{ orderId: r.orderId, userId: r.userId, name: r.name, plan: planLabel(r.snapshot, r.creditQuota), paidAt: r.paidAt }] : [],
  );
}

/** The public feed: empty when switched off, or when fewer than 3 fresh items remain. */
export async function getPublicActivity(now = new Date()): Promise<ActivityItem[]> {
  const settings = await getActivitySettings();
  if (!settings.enabled) return [];
  const items = pickActivityRows(await listRows(settings, now)).map(toActivityItem);
  return visibleActivity(items, now.getTime());
}

/** What /admin/activity shows: the items the feed would carry right now, with order ids to hide them by. */
export async function listAdminActivity(now = new Date()) {
  const settings = await getActivitySettings();
  const picked = pickActivityRows(await listRows(settings, now));
  return { settings, items: picked.map((r) => ({ orderId: r.orderId, ...toActivityItem(r) })), feedVisible: visibleActivity(picked.map(toActivityItem), now.getTime()).length > 0 };
}

export async function adminSaveActivitySettings(actor: Actor, input: { enabled: boolean; planIds: number[] | null }) {
  await db.transaction(async (tx) => {
    const before = await getActivitySettings(tx);
    const after: ActivitySettings = { ...before, enabled: input.enabled, planIds: input.planIds };
    await writeSettings(tx, after);
    await writeAudit(tx, {
      actor,
      action: "activity.settings",
      target: `site_settings:${KEY}`,
      before: { enabled: before.enabled, planIds: before.planIds },
      after: { enabled: after.enabled, planIds: after.planIds },
    });
  });
}

/** Hides one feed item for good by its order id. */
export async function adminHideActivityItem(actor: Actor, orderId: string) {
  if (!z.uuid().safeParse(orderId).success) throw new AdminError("Item tidak valid.");
  await db.transaction(async (tx) => {
    const [order] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.id, orderId));
    if (!order) throw new AdminError("Order tidak ditemukan.");
    const before = await getActivitySettings(tx);
    if (before.hiddenOrderIds.includes(orderId)) return;
    await writeSettings(tx, { ...before, hiddenOrderIds: [...before.hiddenOrderIds, orderId].slice(-HIDDEN_LIMIT) });
    await writeAudit(tx, { actor, action: "activity.hide_item", target: `order:${orderId}` });
  });
}

export async function getShowActivity(userId: string): Promise<boolean> {
  const [row] = await db.select({ show: user.showActivity }).from(user).where(eq(user.id, userId));
  return row?.show ?? true;
}

export async function setShowActivity(userId: string, show: boolean) {
  await db.update(user).set({ showActivity: show }).where(eq(user.id, userId));
}
