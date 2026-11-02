import { z } from "zod";
import { isValidPromoValue } from "@/lib/discount";
import { parseWib } from "@/lib/wib";

/** Admin promo form (F06). Input is FormData strings; output is what the promotions table stores. */

export const PROMO_CODE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

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

export const promoFormSchema = z
  .object({
    name: z.string().trim().min(1, "Nama wajib diisi.").max(80, "Maksimal 80 karakter."),
    kind: z.enum(["percent", "fixed"], "Pilih jenis diskon."),
    value: z.string().trim().regex(/^\d+$/, "Nilai harus bilangan bulat.").transform(Number),
    code: z
      .string()
      .trim()
      .refine((v) => v === "" || PROMO_CODE_PATTERN.test(v), "Kode hanya huruf, angka, - dan _, maksimal 32 karakter.")
      .transform((v) => (v === "" ? null : v)),
    planIds: z.array(z.number().int().positive()),
    startsAt: optDate,
    endsAt: optDate,
    maxRedemptions: optInt("Kuota", 1, 1_000_000),
    perUserLimit: optInt("Batas per user", 1, 1000),
  })
  .superRefine((v, ctx) => {
    if (!isValidPromoValue(v.kind, v.value)) {
      ctx.addIssue({ code: "custom", path: ["value"], message: v.kind === "percent" ? "Persen harus antara 1 dan 90." : "Potongan harus antara Rp1 dan Rp100.000.000." });
    }
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Akhir periode harus setelah awalnya." });
    }
  });

export type PromoInput = z.output<typeof promoFormSchema>;

/** Plan checkboxes arrive as `plan_<id>=on`. Missing keys count as empty so a hand-made POST gets field errors, not a crash. */
export function parsePromoForm(raw: Record<string, string>) {
  const planIds = Object.keys(raw)
    .map((k) => /^plan_(\d{1,9})$/.exec(k)?.[1])
    .filter((id): id is string => id !== undefined)
    .map(Number);
  return promoFormSchema.safeParse({
    name: raw.name ?? "",
    kind: raw.kind ?? "",
    value: raw.value ?? "",
    code: raw.code ?? "",
    planIds,
    startsAt: raw.startsAt ?? "",
    endsAt: raw.endsAt ?? "",
    maxRedemptions: raw.maxRedemptions ?? "",
    perUserLimit: raw.perUserLimit ?? "",
  });
}
