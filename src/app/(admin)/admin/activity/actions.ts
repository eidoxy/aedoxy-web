"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { getAdminActor, requireAdmin } from "@/server/admin";
import { formStrings, toActionError, type AdminFormState } from "@/server/admin-action";
import { adminHideActivityItem, adminSaveActivitySettings } from "@/server/domain/activity";

function refresh() {
  updateTag("activity"); // the cached public feed
  revalidatePath("/admin/activity");
}

const settingsInput = z.object({
  enabled: z.boolean(),
  // Plans left unchecked stay out of the feed. Every plan checked means "all plans", so plans added later appear too.
  planIds: z.array(z.coerce.number().int().positive()),
  allPlanIds: z.array(z.coerce.number().int().positive()),
});

/** No fresh 2FA: the feed is cosmetic and every change is audited. It still needs an admin. */
export async function saveActivitySettingsAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = settingsInput.safeParse({
    enabled: formData.get("enabled") === "on",
    planIds: formData.getAll("planId"),
    allPlanIds: formData.getAll("allPlanId"),
  });
  if (!parsed.success) return { error: "Data tidak valid." };
  try {
    const { enabled, planIds, allPlanIds } = parsed.data;
    const all = allPlanIds.every((id) => planIds.includes(id));
    await adminSaveActivitySettings(await getAdminActor(session), { enabled, planIds: all ? null : planIds });
  } catch (err) {
    return toActionError(err);
  }
  refresh();
  return { ok: "Pengaturan aktivitas disimpan." };
}

export async function hideActivityItemAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const { orderId = "" } = formStrings(formData);
  try {
    await adminHideActivityItem(await getAdminActor(session), orderId);
  } catch (err) {
    return toActionError(err);
  }
  refresh();
  return { ok: "Item disembunyikan." };
}
