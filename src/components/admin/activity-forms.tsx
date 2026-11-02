"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { hideActivityItemAction, saveActivitySettingsAction } from "@/app/(admin)/admin/activity/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { AdminFormState } from "@/server/admin-action";
import { Card } from "./common";
import { FormResult } from "./totp-field";

type PlanOption = { id: number; name: string };

export function ActivitySettingsForm({ enabled, plans, allowedIds }: { enabled: boolean; plans: PlanOption[]; allowedIds: number[] | null }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveActivitySettingsAction, {});
  return (
    <Card>
      <h2 className="text-lg font-medium text-heading">Pengaturan feed</h2>
      <form action={action} className="mt-4 space-y-5">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor="enabled" className="text-sm text-heading">
            Tampilkan feed aktivitas di situs
          </label>
          <Switch id="enabled" name="enabled" defaultChecked={enabled} />
        </div>
        <fieldset>
          <legend className="mono-label mb-2">Paket yang boleh tampil</legend>
          <ul className="grid gap-2 sm:grid-cols-2">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <input type="hidden" name="allPlanId" value={p.id} />
                <input
                  id={`plan-${p.id}`}
                  type="checkbox"
                  name="planId"
                  value={p.id}
                  defaultChecked={allowedIds === null || allowedIds.includes(p.id)}
                  className="size-4 accent-[var(--primary)]"
                />
                <label htmlFor={`plan-${p.id}`}>{p.name}</label>
              </li>
            ))}
          </ul>
        </fieldset>
        <FormResult error={state.error} ok={state.ok} />
        <Button type="submit" disabled={pending} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan
        </Button>
      </form>
    </Card>
  );
}

export function HideItemForm({ orderId, label }: { orderId: string; label: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(hideActivityItemAction, {});
  return (
    <form action={action} className="flex items-center justify-end gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      {state.error && (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`Sembunyikan item ${label}`}>
        {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        Sembunyikan item ini
      </Button>
    </form>
  );
}
