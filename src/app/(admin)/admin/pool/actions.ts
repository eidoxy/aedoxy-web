"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { QUOTA_PER_USD } from "@/lib/format";
import { getAdminActor, requireAdmin, requireFreshTotp } from "@/server/admin";
import { formStrings, toActionError, type AdminFormState } from "@/server/admin-action";
import { adminAdjustPool, adminSetLowThreshold } from "@/server/domain/admin-pool";

const usd = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, "Isi nominal dolar, maksimal 2 desimal.")
  .transform((s) => Math.round(Number(s) * QUOTA_PER_USD));

const adjustInput = z.object({
  direction: z.enum(["add", "remove"]),
  amountUsd: usd.refine((q) => q > 0, "Nominal harus lebih dari nol."),
  note: z.string().trim().min(1, "Catatan wajib diisi.").max(300),
  totp: z.string().default(""),
});

/** Add or remove stock. Re-authenticates with a fresh 2FA code on the server. */
export async function adjustPoolAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = adjustInput.safeParse(formStrings(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    await requireFreshTotp(parsed.data.totp);
    const { amountUsd, direction, note } = parsed.data;
    await adminAdjustPool(await getAdminActor(session), { deltaQuota: direction === "add" ? amountUsd : -amountUsd, note });
  } catch (err) {
    return toActionError(err);
  }
  revalidatePath("/admin/pool");
  return { ok: "Stok diperbarui." };
}

const thresholdInput = z.object({ thresholdUsd: usd, totp: z.string().default("") });

export async function setThresholdAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = thresholdInput.safeParse(formStrings(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    await requireFreshTotp(parsed.data.totp);
    await adminSetLowThreshold(await getAdminActor(session), parsed.data.thresholdUsd);
  } catch (err) {
    return toActionError(err);
  }
  revalidatePath("/admin/pool");
  return { ok: "Ambang disimpan." };
}
