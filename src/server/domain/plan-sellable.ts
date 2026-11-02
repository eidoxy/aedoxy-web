import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { plans } from "@/server/db/schema";

/**
 * A plan can be bought only while New API holds its current synced fields (F05):
 * it has a console id and the version the last sync pushed equals the current one.
 */
export const planIsSynced = sql`(${plans.newapiPlanId} is not null and ${plans.syncedVersion} = ${plans.fieldsVersion})`;

/** Plans a buyer can order right now: enabled, synced and inside the sale window. */
export async function listOnSalePlans(now = new Date()) {
  const rows = await db.select().from(plans).where(and(eq(plans.enabled, true), planIsSynced)).orderBy(asc(plans.sortOrder), asc(plans.id));
  return rows.filter((p) => (!p.saleStartsAt || p.saleStartsAt <= now) && (!p.saleEndsAt || p.saleEndsAt > now));
}

export const isPlanSynced = (p: { newapiPlanId: number | null; syncedVersion: number | null; fieldsVersion: number }) =>
  p.newapiPlanId !== null && p.syncedVersion === p.fieldsVersion;
