import { QUOTA_PER_USD } from "@/lib/format";
import { PERIOD_LABEL } from "@/lib/plans";
import { listOnSalePlans } from "@/server/domain/plan-sellable";
import { getPoolStatus } from "@/server/domain/pool-status";
import type { Plan } from "./types";

/**
 * Public plan list: what a buyer can order right now (enabled, synced to New API, inside the sale window).
 * The public name is the period ("Mingguan", "Bulanan"); pages append the credit themselves. A custom period keeps the admin's name.
 */
export async function loadPlans(): Promise<Plan[]> {
  const [rows, pool] = await Promise.all([listOnSalePlans(), getPoolStatus()]);
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.period === "custom" ? p.name : PERIOD_LABEL[p.period],
    tagline: p.subtitle,
    period: p.period,
    durationDays: p.durationUnit === "day" ? p.durationValue : Math.max(1, Math.ceil(p.durationValue / 24)),
    creditUsd: p.creditQuota / QUOTA_PER_USD,
    priceIdr: p.priceIdr,
    compareAtPriceIdr: p.compareAtPriceIdr,
    badge: p.badge,
    fairUse: p.fairUse,
    stock: pool === "empty" || (p.stockLimit !== null && p.soldCount >= p.stockLimit) ? "out" : pool,
    sortOrder: p.sortOrder,
  }));
}
