"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminActor, requireAdmin } from "@/server/admin";
import { formStrings, toActionError, type AdminFormState } from "@/server/admin-action";
import { retryDeadFulfillment } from "@/server/domain/admin-orders";

const input = z.object({ orderId: z.string().min(1) });

/** Puts a dead fulfillment back in the queue. */
export async function retryFulfillmentAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = input.safeParse(formStrings(formData));
  if (!parsed.success) return { error: "Order tidak valid." };
  try {
    await retryDeadFulfillment(await getAdminActor(session), parsed.data.orderId);
  } catch (err) {
    return toActionError(err);
  }
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  return { ok: "Dimasukkan kembali ke antrean. Worker akan memprosesnya sebentar lagi." };
}
