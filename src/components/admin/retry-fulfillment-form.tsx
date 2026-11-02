"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { retryFulfillmentAction } from "@/app/(admin)/admin/orders/actions";
import { Button } from "@/components/ui/button";
import type { AdminFormState } from "@/server/admin-action";
import { FormResult, TotpField } from "./totp-field";

export function RetryFulfillmentForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(retryFulfillmentAction, {});
  return (
    <form action={action} className="mt-4 max-w-xs space-y-4">
      <input type="hidden" name="orderId" value={orderId} />
      <TotpField />
      <FormResult error={state.error} ok={state.ok} />
      <Button type="submit" disabled={pending} className="h-10 px-4 text-sm font-semibold">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Coba lagi fulfillment
      </Button>
    </form>
  );
}
