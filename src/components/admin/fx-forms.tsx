"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { refreshFxAction, saveFxSettingsAction } from "@/app/(admin)/admin/fx/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminFormState } from "@/server/admin-action";
import { Card, Field, NativeSelect } from "./common";
import { FormResult, TotpField } from "./totp-field";

export function FxSettingsForm({
  initial,
}: {
  initial: { mode: "manual" | "auto"; manualRateIdr: string; refreshHours: number; roundingStepIdr: number; showConversion: boolean };
}) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveFxSettingsAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <Card>
      <h2 className="text-lg font-medium text-heading">Pengaturan kurs</h2>
      <p className="mt-1 text-sm text-fg-muted">Kurs hanya untuk keterangan tampilan. Pembeli tetap membayar harga flat paket.</p>
      <form action={action} className="mt-4 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mode" htmlFor="mode" error={fe.mode?.[0]}>
            <NativeSelect id="mode" name="mode" defaultValue={initial.mode}>
              <option value="auto">Otomatis (disarankan)</option>
              <option value="manual">Manual</option>
            </NativeSelect>
          </Field>
          <Field label="Kurs manual (Rp per $1)" htmlFor="manualRateIdr" hint="Dipakai bila mode manual. Rentang Rp5.000 sampai Rp50.000." error={fe.manualRateIdr?.[0]}>
            <Input id="manualRateIdr" name="manualRateIdr" inputMode="decimal" defaultValue={initial.manualRateIdr} className="h-9 bg-background" />
          </Field>
          <Field label="Interval pembaruan (jam)" htmlFor="refreshHours" hint="Kedua sumber hanya memperbarui data sekali sehari." error={fe.refreshHours?.[0]}>
            <Input id="refreshHours" name="refreshHours" type="number" min={1} max={168} defaultValue={initial.refreshHours} required className="h-9 bg-background" />
          </Field>
          <Field label="Pembulatan tampilan" htmlFor="roundingStepIdr" error={fe.roundingStepIdr?.[0]}>
            <NativeSelect id="roundingStepIdr" name="roundingStepIdr" defaultValue={String(initial.roundingStepIdr)}>
              <option value="1">Rp1</option>
              <option value="100">Rp100 terdekat</option>
            </NativeSelect>
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-heading">
          <input type="checkbox" name="showConversion" defaultChecked={initial.showConversion} className="size-4 accent-primary" />
          Tampilkan konversi rupiah
        </label>
        <TotpField />
        <FormResult error={state.error} ok={state.ok} />
        <Button type="submit" disabled={pending} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan pengaturan
        </Button>
      </form>
    </Card>
  );
}

export function RefreshFxButton() {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(refreshFxAction, {});
  return (
    <form action={action} className="space-y-2">
      <Button type="submit" variant="outline" disabled={pending} className="h-10 px-4 text-sm font-semibold">
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
        Perbarui sekarang
      </Button>
      <FormResult error={state.error} ok={state.ok} />
    </form>
  );
}
