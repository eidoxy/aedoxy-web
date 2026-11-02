import { and, eq, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { plans } from "@/server/db/schema";
import { NewApiError, upsertPlan, type NewApiPlanInput } from "@/server/integrations/newapi";
import { planIsSynced } from "./plan-sellable";

/**
 * Pushes one plan to New API (TRD 7.3, F05). Pool-only settings are fixed here:
 * no wallet payment, no wallet overflow and no periodic quota reset, so usage
 * only ever draws on the plan's credit. A plan without `newapi_plan_id` cannot
 * be bought (createPlanOrder rejects it).
 *
 * Throws NewApiError when the console rejects or cannot be reached; the plan
 * stays unsynced and the caller may retry.
 */
export async function syncPlan(planId: number): Promise<{ newapiPlanId: number }> {
  const [plan] = await db.select().from(plans).where(eq(plans.id, planId)).limit(1);
  if (!plan) throw new RangeError(`Plan ${planId} does not exist`);

  const payload: NewApiPlanInput = {
    title: plan.name,
    subtitle: plan.subtitle ?? "",
    // shortcut: the console price is display-only (Aedoxy charges in IDR via Poketo), so it is 0; revisit if the console storefront is ever exposed.
    price_amount: 0,
    currency: "USD",
    duration_unit: plan.durationUnit,
    duration_value: plan.durationValue,
    enabled: plan.enabled,
    sort_order: plan.sortOrder,
    allow_balance_pay: false,
    allow_wallet_overflow: false,
    max_purchase_per_user: plan.maxPurchasePerUser,
    upgrade_group: plan.upgradeGroup ?? "",
    total_amount: plan.creditQuota,
    quota_reset_period: "never",
  };
  const newapiPlanId = await upsertPlan(payload, plan.newapiPlanId);
  // Records the version that was pushed, so an edit made during the call leaves the plan unsynced.
  await db
    .update(plans)
    .set({ newapiPlanId, syncedAt: new Date(), syncedVersion: plan.fieldsVersion, updatedAt: new Date() })
    .where(eq(plans.id, plan.id));
  return { newapiPlanId };
}

/**
 * Hourly retry (F05): pushes every plan whose New API copy is stale or missing.
 * A disabled plan that was never pushed is skipped; it syncs once it is enabled.
 */
export async function retryUnsyncedPlans() {
  const pending = await db
    .select({ id: plans.id, slug: plans.slug })
    .from(plans)
    .where(and(sql`not coalesce(${planIsSynced}, false)`, or(isNotNull(plans.newapiPlanId), eq(plans.enabled, true))))
    .orderBy(plans.sortOrder, plans.id);
  let synced = 0;
  const failed: { slug: string; reason: string }[] = [];
  for (const p of pending) {
    try {
      await syncPlan(p.id);
      synced++;
    } catch (err) {
      failed.push({ slug: p.slug, reason: err instanceof NewApiError ? `${err.kind}: ${err.message}` : "unexpected error" });
    }
  }
  if (failed.length > 0) console.warn("[plan-sync] retry failed", failed);
  return { synced, failed };
}
