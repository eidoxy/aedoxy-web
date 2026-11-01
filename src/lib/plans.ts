import type { Plan } from "@/server/catalog/types";

export const PERIOD_LABEL: Record<Plan["period"], string> = {
  weekly: "Mingguan",
  monthly: "Bulanan",
  custom: "Kustom",
};

/** "minggu", "bulan" or "N hari", for "Rp25.000 / minggu". */
export function periodUnit(plan: Pick<Plan, "period" | "durationDays">): string {
  if (plan.period === "weekly") return "minggu";
  if (plan.period === "monthly") return "bulan";
  return `${plan.durationDays} hari`;
}

export function cheapestPlan(plans: Plan[]): Plan | null {
  return plans.reduce<Plan | null>((min, p) => (min === null || p.priceIdr < min.priceIdr ? p : min), null);
}

/** Plan shown in examples: the monthly plan closest to the middle of the list, else the first plan. */
export function featuredPlan(plans: Plan[]): Plan | null {
  const monthly = plans.filter((p) => p.period === "monthly").sort((a, b) => a.sortOrder - b.sortOrder);
  if (monthly.length > 0) return monthly[Math.floor(monthly.length / 2)];
  return plans[0] ?? null;
}
