"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parsePromoForm } from "@/lib/schemas/promo";
import { getAdminActor, requireAdmin } from "@/server/admin";
import { formStrings, toActionError, type AdminFormState } from "@/server/admin-action";
import { createPromo, stopPromo } from "@/server/domain/admin-promos";

function refresh() {
  revalidatePath("/admin/promos");
  revalidatePath("/plans");
}

export async function createPromoAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const raw = formStrings(formData);
  const parsed = parsePromoForm(raw);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    await createPromo(await getAdminActor(session), parsed.data);
  } catch (err) {
    return toActionError(err);
  }
  refresh();
  redirect("/admin/promos?dibuat=1");
}

const stopInput = z.object({ promoId: z.coerce.number().int().positive() });

export async function stopPromoAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = stopInput.safeParse(formStrings(formData));
  if (!parsed.success) return { error: "Promo tidak valid." };
  try {
    await stopPromo(await getAdminActor(session), parsed.data.promoId);
  } catch (err) {
    return toActionError(err);
  }
  refresh();
  return { ok: "Promo dihentikan." };
}
