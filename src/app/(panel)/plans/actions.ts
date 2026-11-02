"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createPlanOrder, OrderError } from "@/server/domain/orders";
import { listOnSalePlans } from "@/server/domain/plan-sellable";
import { normalizeCode, PromoError, quotePlans, rejectionMessage } from "@/server/domain/promotions";
import { requireSession } from "@/server/session";

export type BuyPlanState = {
  error?: string;
  /** Set when the buyer must confirm that their active plan is replaced. */
  needsReplace?: { planName: string; remainingQuota: number; endsAt: string };
};

const input = z.object({
  planId: z.coerce.number().int().positive(),
  replaceConfirmed: z.literal("on").optional(),
  promoCode: z.string().max(64).optional(),
});

export type ApplyPromoState = { error?: string };

/**
 * "Terapkan": validates the code against every plan on sale. A usable code goes to
 * /plans?kode=..., which shows each plan's price; a refused one shows its reason here.
 * The order itself re-validates the code, so the URL proves nothing.
 */
export async function applyPromoAction(_prev: ApplyPromoState, formData: FormData): Promise<ApplyPromoState> {
  const session = await requireSession();
  let code: string | null;
  try {
    code = normalizeCode(String(formData.get("kode") ?? "").slice(0, 64));
    if (code === null) return { error: "Isi kode promo." };
    const onSale = await listOnSalePlans();
    const quotes = [...(await quotePlans(session.user.id, onSale, code)).values()];
    const usable = quotes.some((q) => q.codeRejection === null);
    if (!usable) {
      // Every plan refuses it: all for the same reason in practice, so show the first.
      return { error: rejectionMessage(quotes[0]?.codeRejection ?? "PROMO_INVALID") };
    }
  } catch (err) {
    if (err instanceof PromoError) return { error: err.message };
    console.error("[plans] promo check failed", { userId: session.user.id, error: err instanceof Error ? err.message : "unknown" });
    return { error: "Terjadi kesalahan. Coba lagi sebentar lagi." };
  }
  redirect(`/plans?kode=${encodeURIComponent(code)}`);
}

/** "Beli": creates the order and sends the buyer to its payment page. Never trusts anything but the plan id and the checkbox. */
export async function buyPlan(_prev: BuyPlanState, formData: FormData): Promise<BuyPlanState> {
  const session = await requireSession();
  const parsed = input.safeParse({
    planId: formData.get("planId"),
    replaceConfirmed: formData.get("replaceConfirmed") ?? undefined,
    promoCode: formData.get("promoCode") ?? undefined,
  });
  if (!parsed.success) return { error: "Paket tidak valid." };

  let orderId: string;
  try {
    ({ orderId } = await createPlanOrder({
      userId: session.user.id,
      planId: parsed.data.planId,
      replaceConfirmed: parsed.data.replaceConfirmed === "on",
      promoCode: parsed.data.promoCode,
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
