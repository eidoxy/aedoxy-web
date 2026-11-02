"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { parseModelMetaForm } from "@/lib/schemas/model-meta";
import { getAdminActor, requireAdmin } from "@/server/admin";
import { formStrings, toActionError, type AdminFormState } from "@/server/admin-action";
import { adminUpsertModelMeta } from "@/server/domain/admin-models";

/** No fresh 2FA: this is catalog text, every change is audited, and it still needs an admin. */
export async function saveModelMetaAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = parseModelMetaForm(formStrings(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let created: boolean;
  try {
    ({ created } = await adminUpsertModelMeta(await getAdminActor(session), parsed.data));
  } catch (err) {
    return toActionError(err);
  }
  updateTag("models"); // the cached /models catalog
  revalidatePath("/admin/models");
  return { ok: created ? "Metadata model dibuat." : "Metadata model diperbarui." };
}
