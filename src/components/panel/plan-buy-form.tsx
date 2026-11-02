"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { useActionState } from "react";
import { buyPlan, type BuyPlanState } from "@/app/(panel)/plans/actions";
import { FormMessage } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { formatUsd, QUOTA_PER_USD } from "@/lib/format";

/** Buy button for one plan. The replacement checkbox shows when the buyer already has an active plan, or after the server asks for it. */
export function PlanBuyForm({ planId, planName, hasActive, disabled, promoCode }: { planId: number; planName: string; hasActive: boolean; disabled?: boolean; promoCode?: string }) {
  const [state, action, pending] = useActionState<BuyPlanState, FormData>(buyPlan, {});
  const needsReplace = hasActive || state.needsReplace !== undefined;
  const checkboxId = `replace-${planId}`;

  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="planId" value={planId} />
      {promoCode && <input type="hidden" name="promoCode" value={promoCode} />}
      {needsReplace && (
        <div className="rounded-xl border border-line bg-alt p-3.5">
          <p className="flex items-start gap-2 text-sm text-fg-soft">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <span>
              Paket lama akan diganti.
              {state.needsReplace
                ? ` ${state.needsReplace.planName} berakhir sekarang dan sisa kredit ${formatUsd(state.needsReplace.remainingQuota / QUOTA_PER_USD)} hangus.`
                : " Paket aktif Anda berakhir sekarang dan sisa kreditnya hangus."}
            </span>
          </p>
          <label htmlFor={checkboxId} className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-heading">
            <input id={checkboxId} type="checkbox" name="replaceConfirmed" required className="mt-0.5 size-4 shrink-0 accent-primary" />
            Saya mengerti, ganti dengan {planName}
          </label>
        </div>
      )}
      <Button type="submit" disabled={disabled || pending} className="h-11 w-full text-sm font-semibold">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {disabled ? "Stok habis" : "Beli"}
      </Button>
      <FormMessage tone="error">{state.error}</FormMessage>
    </form>
  );
}
