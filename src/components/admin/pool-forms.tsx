"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { adjustPoolAction, setThresholdAction } from "@/app/(admin)/admin/pool/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AdminFormState } from "@/server/admin-action";
import { SectionCard } from "@/components/console/section-card";
import { Field, NativeSelect } from "./common";
import { FormResult, TotpField } from "./totp-field";

export function AdjustPoolForm() {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(adjustPoolAction, {});
  const fe = state.fieldErrors ?? {};
  return (
    <SectionCard title="Tambah / kurangi stok" description="Setiap perubahan tercatat di ledger dan audit log, dan meminta kode 2FA.">
      <form action={action} className="max-w-xl space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Aksi" htmlFor="direction">
            <NativeSelect id="direction" name="direction" defaultValue="add">
              <option value="add">Tambah</option>
              <option value="remove">Kurangi</option>
            </NativeSelect>
          </Field>
          <Field label="Nominal (USD)" htmlFor="amountUsd" error={fe.amountUsd?.[0]}>
            <Input id="amountUsd" name="amountUsd" inputMode="decimal" placeholder="100" required className="h-9 bg-background" />
          </Field>
        </div>
        <Field label="Catatan" htmlFor="note" hint="Wajib. Contoh: top up upstream Anthropic, invoice #123." error={fe.note?.[0]}>
          <Textarea id="note" name="note" required maxLength={300} rows={2} className="bg-background" />
        </Field>
        <TotpField />
        <FormResult error={state.error} ok={state.ok} />
        <Button type="submit" disabled={pending} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan perubahan stok
        </Button>
      </form>
    </SectionCard>
  );
}

export function ThresholdForm({ currentUsd }: { currentUsd: number }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(setThresholdAction, {});
  return (
    <SectionCard
      title="Ambang stok hampir habis"
      description="Di bawah ambang ini, pembeli melihat status “stok menipis”. Isi 0 untuk memakai bawaan ($50)."
    >
      <form action={action} className="max-w-xl space-y-4">
        <Field label="Ambang (USD)" htmlFor="thresholdUsd" error={state.fieldErrors?.thresholdUsd?.[0]}>
          <Input id="thresholdUsd" name="thresholdUsd" inputMode="decimal" defaultValue={String(currentUsd)} required className="h-9 bg-background" />
        </Field>
        <TotpField id="totp-threshold" />
        <FormResult error={state.error} ok={state.ok} />
        <Button type="submit" variant="outline" disabled={pending} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan ambang
        </Button>
      </form>
    </SectionCard>
  );
}
