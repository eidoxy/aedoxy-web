import { z } from "zod";
import { QUOTA_PER_USD } from "@/lib/format";
import { parseWib, toWibInput } from "@/lib/wib";

/** Admin plan form (F05). Input is FormData strings; output is what the plans table stores. */

export const PLAN_PRICE_MIN = 10_000;
/** The orders table caps an order at Rp10.000.000 (QRIS limit), so a plan price above it could never be bought. */
export const PLAN_PRICE_MAX = 10_000_000;

const FIELD_KEYS = [
  "name", "subtitle", "badge", "period", "customValue", "customUnit", "creditUsd", "priceIdr", "compareAtPriceIdr",
  "upgradeGroup", "maxPurchasePerUser", "stockLimit", "saleStartsAt", "saleEndsAt", "sortOrder",
] as const;

const optText = (max: number) =>
  z.string().trim().max(max, `Maksimal ${max} karakter.`).transform((v) => (v === "" ? null : v));

const digits = (label: string) => z.string().trim().regex(/^\d+$/, `${label} harus bilangan bulat.`).transform(Number);

const optInt = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+$/.test(v), `${label} harus bilangan bulat.`)
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (v >= min && v <= max), `${label} harus antara ${min} dan ${max}.`);

const optDate = z
  .string()
  .trim()
  .refine((v) => v === "" || parseWib(v) !== null, "Tanggal tidak valid.")
  .transform((v) => (v === "" ? null : parseWib(v)));

const periodDays = { weekly: 7, monthly: 30 } as const;

export const planFormSchema = z
  .object({
    name: z.string().trim().min(1, "Nama wajib diisi.").max(80, "Maksimal 80 karakter."),
    subtitle: optText(160),
    badge: optText(24),
    period: z.enum(["weekly", "monthly", "custom"], "Pilih periode."),
    customValue: optInt("Durasi", 1, 8760),
    customUnit: z.enum(["hour", "day"]),
    creditUsd: z
      .string()
      .trim()
      .regex(/^\d{1,6}(\.\d{1,2})?$/, "Isi dolar, maksimal 2 desimal.")
      .transform(Number)
      .refine((v) => v > 0, "Kredit harus lebih dari nol."),
    priceIdr: digits("Harga flat").refine((v) => v >= PLAN_PRICE_MIN && v <= PLAN_PRICE_MAX, `Harga flat harus antara Rp10.000 dan Rp10.000.000.`),
    compareAtPriceIdr: optInt("Harga coret", 1, 100_000_000),
    upgradeGroup: optText(64),
    maxPurchasePerUser: digits("Batas beli").refine((v) => v <= 1000, "Maksimal 1000."),
    stockLimit: optInt("Stok", 0, 1_000_000),
    saleStartsAt: optDate,
    saleEndsAt: optDate,
    enabled: z.boolean(),
    sortOrder: optInt("Urutan", 0, 9999),
  })
  .superRefine((v, ctx) => {
    if (v.period === "custom" && v.customValue === null) ctx.addIssue({ code: "custom", path: ["customValue"], message: "Isi durasi untuk periode kustom." });
    if (v.compareAtPriceIdr !== null && v.compareAtPriceIdr <= v.priceIdr) {
      ctx.addIssue({ code: "custom", path: ["compareAtPriceIdr"], message: "Harga coret harus lebih besar dari harga flat." });
    }
    if (v.saleStartsAt && v.saleEndsAt && v.saleEndsAt <= v.saleStartsAt) {
      ctx.addIssue({ code: "custom", path: ["saleEndsAt"], message: "Akhir penjualan harus setelah awalnya." });
    }
  })
  .transform((v) => ({
    name: v.name,
    subtitle: v.subtitle,
    badge: v.badge,
    period: v.period,
    durationUnit: v.period === "custom" ? v.customUnit : ("day" as const),
    durationValue: v.period === "custom" ? (v.customValue as number) : periodDays[v.period],
    creditQuota: Math.round(v.creditUsd * QUOTA_PER_USD),
    priceIdr: v.priceIdr,
    compareAtPriceIdr: v.compareAtPriceIdr,
    upgradeGroup: v.upgradeGroup,
    maxPurchasePerUser: v.maxPurchasePerUser,
    stockLimit: v.stockLimit,
    saleStartsAt: v.saleStartsAt,
    saleEndsAt: v.saleEndsAt,
    enabled: v.enabled,
    sortOrder: v.sortOrder,
  }));

export type PlanInput = z.output<typeof planFormSchema>;

/** Missing keys count as empty, so a hand-made POST without a field gets a field error instead of a crash. */
export function parsePlanForm(raw: Record<string, string>) {
  const input: Record<string, unknown> = Object.fromEntries(FIELD_KEYS.map((k) => [k, raw[k] ?? ""]));
  input.customUnit = raw.customUnit || "day";
  input.enabled = raw.enabled === "on";
  return planFormSchema.safeParse(input);
}

type PlanRow = {
  name: string;
  subtitle: string | null;
  badge: string | null;
  period: "weekly" | "monthly" | "custom";
  durationUnit: "hour" | "day";
  durationValue: number;
  creditQuota: number;
  priceIdr: number;
  compareAtPriceIdr: number | null;
  upgradeGroup: string | null;
  maxPurchasePerUser: number;
  stockLimit: number | null;
  saleStartsAt: Date | null;
  saleEndsAt: Date | null;
  enabled: boolean;
  sortOrder: number;
};

/** Plan row -> the strings the form shows. */
export function planToFormValues(p: PlanRow): Record<string, string> {
  return {
    name: p.name,
    subtitle: p.subtitle ?? "",
    badge: p.badge ?? "",
    period: p.period,
    customValue: p.period === "custom" ? String(p.durationValue) : "",
    customUnit: p.durationUnit,
    creditUsd: String(p.creditQuota / QUOTA_PER_USD),
    priceIdr: String(p.priceIdr),
    compareAtPriceIdr: p.compareAtPriceIdr === null ? "" : String(p.compareAtPriceIdr),
    upgradeGroup: p.upgradeGroup ?? "",
    maxPurchasePerUser: String(p.maxPurchasePerUser),
    stockLimit: p.stockLimit === null ? "" : String(p.stockLimit),
    saleStartsAt: p.saleStartsAt ? toWibInput(p.saleStartsAt) : "",
    saleEndsAt: p.saleEndsAt ? toWibInput(p.saleEndsAt) : "",
    sortOrder: String(p.sortOrder),
  };
}
