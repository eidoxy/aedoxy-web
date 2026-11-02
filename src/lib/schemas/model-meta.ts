import { z } from "zod";

/** Admin form for model_meta (F08). Input is FormData strings; output is what the table stores. */

export const CAPABILITY_VALUES = ["text", "image", "file", "reasoning"] as const;

const optInt = (label: string, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+$/.test(v), `${label} harus bilangan bulat.`)
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || v <= max, `${label} maksimal ${max.toLocaleString("id-ID")}.`);

/** USD per 1M tokens, up to 4 decimals (the numeric(12,4) column). Kept as a string for the numeric column. */
const optUsd = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{1,7}([.,]\d{1,4})?$/.test(v), `${label}: isi dolar per 1 juta token, maksimal 4 desimal.`)
    .transform((v) => (v === "" ? null : v.replace(",", ".")));

export const modelMetaSchema = z
  .object({
    modelName: z.string().trim().min(1, "Nama model wajib diisi.").max(200, "Maksimal 200 karakter."),
    provider: z.string().trim().min(1, "Provider wajib diisi.").max(60, "Maksimal 60 karakter."),
    contextIn: optInt("Context input", 100_000_000),
    contextOut: optInt("Context output", 100_000_000),
    capabilities: z.array(z.enum(CAPABILITY_VALUES)),
    officialInputUsdPerM: optUsd("Harga resmi input"),
    officialOutputUsdPerM: optUsd("Harga resmi output"),
    visible: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if ((v.officialInputUsdPerM === null) !== (v.officialOutputUsdPerM === null)) {
      ctx.addIssue({ code: "custom", path: ["officialOutputUsdPerM"], message: "Isi harga resmi input dan output, atau kosongkan keduanya." });
    }
  });

export type ModelMetaInput = z.output<typeof modelMetaSchema>;

/** Capability checkboxes arrive as `cap_<name>=on`, the visibility switch as `visible=on`. */
export function parseModelMetaForm(raw: Record<string, string>) {
  return modelMetaSchema.safeParse({
    modelName: raw.modelName ?? "",
    provider: raw.provider ?? "",
    contextIn: raw.contextIn ?? "",
    contextOut: raw.contextOut ?? "",
    capabilities: CAPABILITY_VALUES.filter((c) => raw[`cap_${c}`] === "on"),
    officialInputUsdPerM: raw.officialInputUsdPerM ?? "",
    officialOutputUsdPerM: raw.officialOutputUsdPerM ?? "",
    visible: raw.visible === "on",
  });
}
