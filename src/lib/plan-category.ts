/** Period tabs on /plans. Pure, so the page and the tests share one rule. */

export type PlanCategory = "daily" | "weekly" | "monthly" | "other";
export type PeriodTab = "all" | "daily" | "weekly" | "monthly";

type PlanPeriodFields = { period: "weekly" | "monthly" | "custom"; durationUnit: "hour" | "day"; durationValue: number };

const HOURS_PER_WEEK = 7 * 24;

/** Weekly and monthly follow the plan period. A custom plan shorter than 7 days is daily; a longer one only shows under "Semua". */
export function planCategory(plan: PlanPeriodFields): PlanCategory {
  if (plan.period === "weekly") return "weekly";
  if (plan.period === "monthly") return "monthly";
  const hours = plan.durationUnit === "hour" ? plan.durationValue : plan.durationValue * 24;
  return hours < HOURS_PER_WEEK ? "daily" : "other";
}

export const PERIOD_TABS: { value: PeriodTab; label: string; empty: string }[] = [
  { value: "all", label: "Semua", empty: "Belum ada paket yang dijual saat ini." },
  { value: "daily", label: "Harian", empty: "Belum ada paket harian." },
  { value: "weekly", label: "Mingguan", empty: "Belum ada paket mingguan." },
  { value: "monthly", label: "Bulanan", empty: "Belum ada paket bulanan." },
];

/** Reads `?periode=`; anything unknown falls back to "Semua". */
export function parsePeriodTab(value: string | null | undefined): PeriodTab {
  return PERIOD_TABS.find((t) => t.value === value)?.value ?? "all";
}

export const matchesTab = (category: PlanCategory, tab: PeriodTab) => tab === "all" || category === tab;

export function categoryLabel(plan: PlanPeriodFields): string {
  const category = planCategory(plan);
  return category === "daily" ? "Harian" : category === "weekly" ? "Mingguan" : category === "monthly" ? "Bulanan" : "Kustom";
}
