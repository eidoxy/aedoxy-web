import { sql } from "drizzle-orm";
import { plans } from "@/server/db/schema";

/**
 * A plan can be bought only while New API holds its current synced fields (F05):
 * it has a console id and the version the last sync pushed equals the current one.
 */
export const planIsSynced = sql`(${plans.newapiPlanId} is not null and ${plans.syncedVersion} = ${plans.fieldsVersion})`;

export const isPlanSynced = (p: { newapiPlanId: number | null; syncedVersion: number | null; fieldsVersion: number }) =>
  p.newapiPlanId !== null && p.syncedVersion === p.fieldsVersion;
