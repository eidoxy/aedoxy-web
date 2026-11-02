"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { savePlanAction } from "@/app/(admin)/admin/plans/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminFormState } from "@/server/admin-action";
import { Card, Field, NativeSelect } from "./common";
import { FormResult, TotpField } from "./totp-field";

const input = "h-9 bg-background";

/** Create / edit form. `values` are strings as the form shows them (planToFormValues). */
export function PlanForm({ planId, values, enabled, sold }: { planId?: number; values: Record<string, string>; enabled: boolean; sold: boolean }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(savePlanAction, {});
  const [period, setPeriod] = useState(values.period || "monthly");
  const fe = state.fieldErrors ?? {};
  const v = (k: string) => values[k] ?? "";

  return (
    <form action={action} className="space-y-6">
      {planId !== undefined && <input type="hidden" name="planId" value={planId} />}

      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama" htmlFor="name" error={fe.name?.[0]}>
          <Input id="name" name="name" defaultValue={v("name")} required maxLength={80} className={input} />
        </Field>
        <Field label="Subjudul" htmlFor="subtitle" error={fe.subtitle?.[0]}>
          <Input id="subtitle" name="subtitle" defaultValue={v("subtitle")} maxLength={160} className={input} />
        </Field>
        <Field label="Badge" htmlFor="badge" hint="Contoh: Terlaris, Promo." error={fe.badge?.[0]}>
          <Input id="badge" name="badge" defaultValue={v("badge")} maxLength={24} className={input} />
        </Field>
        <Field label="Grup setelah beli" htmlFor="upgradeGroup" hint="Opsional. Untuk rate limit dan akses model." error={fe.upgradeGroup?.[0]}>
          <Input id="upgradeGroup" name="upgradeGroup" defaultValue={v("upgradeGroup")} maxLength={64} className={input} />
        </Field>
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="Periode" htmlFor="period" error={fe.period?.[0]}>
          <NativeSelect id="period" name="period" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="weekly">Mingguan (7 hari)</option>
            <option value="monthly">Bulanan (30 hari)</option>
            <option value="custom">Kustom</option>
          </NativeSelect>
        </Field>
        {period === "custom" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Durasi" htmlFor="customValue" error={fe.customValue?.[0]}>
              <Input id="customValue" name="customValue" inputMode="numeric" defaultValue={v("customValue")} className={input} />
            </Field>
            <Field label="Satuan" htmlFor="customUnit">
              <NativeSelect id="customUnit" name="customUnit" defaultValue={v("customUnit") || "day"}>
                <option value="day">Hari</option>
                <option value="hour">Jam</option>
              </NativeSelect>
            </Field>
          </div>
        ) : (
          <div />
        )}
        <Field label="Kredit (USD)" htmlFor="creditUsd" error={fe.creditUsd?.[0]}>
          <Input id="creditUsd" name="creditUsd" inputMode="decimal" defaultValue={v("creditUsd")} required className={input} />
        </Field>
        <Field label="Batas beli per user" htmlFor="maxPurchasePerUser" hint="0 = tanpa batas." error={fe.maxPurchasePerUser?.[0]}>
          <Input id="maxPurchasePerUser" name="maxPurchasePerUser" inputMode="numeric" defaultValue={v("maxPurchasePerUser") || "0"} className={input} />
        </Field>
      </Card>

      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="Harga flat (Rp)" htmlFor="priceIdr" hint="Bilangan bulat, minimal Rp10.000." error={fe.priceIdr?.[0]}>
          <Input id="priceIdr" name="priceIdr" inputMode="numeric" defaultValue={v("priceIdr")} required className={input} />
        </Field>
        <Field label="Harga coret (Rp)" htmlFor="compareAtPriceIdr" hint="Opsional. Harus lebih besar dari harga flat." error={fe.compareAtPriceIdr?.[0]}>
          <Input id="compareAtPriceIdr" name="compareAtPriceIdr" inputMode="numeric" defaultValue={v("compareAtPriceIdr")} className={input} />
        </Field>
        <Field label="Stok paket" htmlFor="stockLimit" hint="Kosong = tanpa batas." error={fe.stockLimit?.[0]}>
          <Input id="stockLimit" name="stockLimit" inputMode="numeric" defaultValue={v("stockLimit")} className={input} />
        </Field>
        <Field label="Urutan" htmlFor="sortOrder" hint="Kosong = paling akhir. Angka kecil tampil lebih dulu." error={fe.sortOrder?.[0]}>
          <Input id="sortOrder" name="sortOrder" inputMode="numeric" defaultValue={v("sortOrder")} className={input} />
        </Field>
        <Field label="Mulai dijual (WIB)" htmlFor="saleStartsAt" error={fe.saleStartsAt?.[0]}>
          <Input id="saleStartsAt" name="saleStartsAt" type="datetime-local" defaultValue={v("saleStartsAt")} className={input} />
        </Field>
        <Field label="Selesai dijual (WIB)" htmlFor="saleEndsAt" error={fe.saleEndsAt?.[0]}>
          <Input id="saleEndsAt" name="saleEndsAt" type="datetime-local" defaultValue={v("saleEndsAt")} className={input} />
        </Field>
        <label className="flex items-center gap-2.5 text-sm text-heading sm:col-span-2">
          <input type="checkbox" name="enabled" defaultChecked={enabled} className="size-4 accent-primary" />
          Aktif (bisa dibeli setelah tersinkron)
        </label>
      </Card>

      {(state.confirm || sold) && (
        <Card className="border-warn/40">
          <p className="flex items-start gap-2 text-sm text-fg-soft">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
            <span>
              {state.confirm ?? "Paket ini sudah pernah terjual."} Mengubah kredit membuat pembeli lama dan baru mendapat isi berbeda dengan nama yang sama. Paket yang sudah aktif milik pembeli tidak berubah.
            </span>
          </p>
          <label className="mt-3 flex items-start gap-2.5 text-sm text-heading">
            <input type="checkbox" name="confirmCreditChange" defaultChecked={Boolean(state.confirm)} className="mt-0.5 size-4 accent-primary" />
            Saya mengerti, ubah kredit paket ini
          </label>
        </Card>
      )}

      <Card className="max-w-sm space-y-4">
        <TotpField />
        <FormResult error={state.error} ok={state.ok} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="intent" value="save" disabled={pending} className="h-10 px-4 text-sm font-semibold">
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {planId === undefined ? "Buat paket" : "Simpan perubahan"}
          </Button>
          {planId !== undefined && (state.confirm || sold) && (
            <Button type="submit" name="intent" value="save_as_new" variant="outline" disabled={pending} className="h-10 px-4 text-sm font-semibold">
              Simpan sebagai paket baru
            </Button>
          )}
        </div>
      </Card>
    </form>
  );
}
