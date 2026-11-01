"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createPlanOrder, OrderError } from "@/server/domain/orders";
import { requireSession } from "@/server/session";

export type BuyPlanState = {
  error?: string;
  /** Set when the buyer must confirm that their active plan is replaced. */
  needsReplace?: { planName: string; remainingQuota: number; endsAt: string };
};

const input = z.object({
  planId: z.coerce.number().int().positive(),
  replaceConfirmed: z.literal("on").optional(),
});

/** "Beli": creates the order and sends the buyer to its payment page. Never trusts anything but the plan id and the checkbox. */
export async function buyPlan(_prev: BuyPlanState, formData: FormData): Promise<BuyPlanState> {
  const session = await requireSession();
  const parsed = input.safeParse({
    planId: formData.get("planId"),
    replaceConfirmed: formData.get("replaceConfirmed") ?? undefined,
  });
  if (!parsed.success) return { error: "Paket tidak valid." };

  let orderId: string;
  try {
    ({ orderId } = await createPlanOrder({
      userId: session.user.id,
      planId: parsed.data.planId,
      replaceConfirmed: parsed.data.replaceConfirmed === "on",
    }));
  } catch (err) {
    if (err instanceof OrderError) {
      if (err.code === "REPLACE_CONFIRMATION_REQUIRED" && err.details) {
        return {
          error: "Anda masih punya paket aktif. Centang konfirmasi penggantian untuk melanjutkan.",
          needsReplace: { planName: err.details.planName, remainingQuota: err.details.remainingQuota, endsAt: err.details.endsAt.toISOString() },
        };
      }
      return { error: err.message };
    }
    console.error("[plans] buy failed", { userId: session.user.id, error: err instanceof Error ? err.message : "unknown" });
    return { error: "Terjadi kesalahan. Coba lagi sebentar lagi." };
  }
  redirect(`/orders/${orderId}`);
}
