"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { getAdminActor, requireAdmin } from "@/server/admin";
import { formStrings, toActionError, type AdminFormState } from "@/server/admin-action";
import { adminRefreshFx, updateFxSettings } from "@/server/domain/fx-rate";

function refresh() {
  updateTag("fx"); // the cached display rate on /pricing, /models, /plans
  revalidatePath("/admin/fx");
}

const settingsInput = z.object({
  mode: z.enum(["manual", "auto"]),
  manualRateIdr: z
    .string()
    .trim()
    .regex(/^\d{1,6}([.,]\d{1,4})?$/, "Isi kurs dalam rupiah per $1.")
    .or(z.literal(""))
    .transform((s) => (s === "" ? null : Number(s.replace(",", ".")))),
  refreshHours: z.coerce.number().int().min(1, "Minimal 1 jam.").max(168, "Maksimal 168 jam."),
  roundingStepIdr: z.enum(["1", "100"]).transform((s) => Number(s) as 1 | 100),
  showConversion: z.literal("on").optional(),
});

export async function saveFxSettingsAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = settingsInput.safeParse(formStrings(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    const { mode, manualRateIdr, refreshHours, roundingStepIdr, showConversion } = parsed.data;
    await updateFxSettings(await getAdminActor(session), { mode, manualRateIdr, refreshHours, roundingStepIdr, showConversion: showConversion === "on" });
  } catch (err) {
    return toActionError(err);
  }
  refresh();
  return { ok: "Pengaturan kurs disimpan." };
}

/** Only fetches public quotes; needs an admin and is audited. */
export async function refreshFxAction(): Promise<AdminFormState> {
  const session = await requireAdmin();
  let message: string;
  try {
    const r = await adminRefreshFx(await getAdminActor(session));
    message = !r.fetched.primary && !r.fetched.backup ? "Kedua sumber gagal dihubungi. Kurs lama tetap dipakai." : r.alerts.length > 0 ? `Diperbarui dengan peringatan: ${r.alerts.map((a) => a.message).join(" ")}` : "Kurs diperbarui.";
  } catch (err) {
    return toActionError(err);
  }
  refresh();
  return { ok: message };
}
