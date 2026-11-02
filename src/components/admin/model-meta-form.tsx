"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { saveModelMetaAction } from "@/app/(admin)/admin/models/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CAPABILITY_VALUES } from "@/lib/schemas/model-meta";
import type { AdminFormState } from "@/server/admin-action";
import { Card, Field } from "./common";
import { FormResult } from "./totp-field";

const input = "h-9 bg-background";
const CAPABILITY_LABEL: Record<(typeof CAPABILITY_VALUES)[number], string> = { text: "Teks", image: "Gambar", file: "File", reasoning: "Reasoning" };

export type ModelMetaDefaults = {
  modelName: string;
  provider: string;
  contextIn: number | null;
  contextOut: number | null;
  capabilities: string[];
  officialInputUsdPerM: string | null;
  officialOutputUsdPerM: string | null;
  visible: boolean;
};

/** Create or edit one row. `key` on the caller remounts the form when another row is picked. */
export function ModelMetaForm({ defaults }: { defaults: ModelMetaDefaults }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveModelMetaAction, {});
  const fe = state.fieldErrors ?? {};
  const num = (v: number | string | null) => (v === null ? "" : String(Number(v)));
  return (
    <Card>
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama model" htmlFor="modelName" hint="Persis seperti di New API. Nama yang sama memperbarui baris yang ada." error={fe.modelName?.[0]}>
          <Input id="modelName" name="modelName" defaultValue={defaults.modelName} required maxLength={200} className={input} />
        </Field>
        <Field label="Provider" htmlFor="provider" hint="Dipakai untuk pengelompokan dan logo, mis. openai, anthropic." error={fe.provider?.[0]}>
          <Input id="provider" name="provider" defaultValue={defaults.provider} required maxLength={60} className={input} />
        </Field>
        <Field label="Context input (token)" htmlFor="contextIn" error={fe.contextIn?.[0]}>
          <Input id="contextIn" name="contextIn" inputMode="numeric" defaultValue={num(defaults.contextIn)} className={input} />
        </Field>
        <Field label="Context output (token)" htmlFor="contextOut" error={fe.contextOut?.[0]}>
          <Input id="contextOut" name="contextOut" inputMode="numeric" defaultValue={num(defaults.contextOut)} className={input} />
        </Field>
        <Field label="Harga resmi input (USD / 1M)" htmlFor="officialInputUsdPerM" error={fe.officialInputUsdPerM?.[0]}>
          <Input id="officialInputUsdPerM" name="officialInputUsdPerM" inputMode="decimal" defaultValue={num(defaults.officialInputUsdPerM)} className={input} />
        </Field>
        <Field label="Harga resmi output (USD / 1M)" htmlFor="officialOutputUsdPerM" error={fe.officialOutputUsdPerM?.[0]}>
          <Input id="officialOutputUsdPerM" name="officialOutputUsdPerM" inputMode="decimal" defaultValue={num(defaults.officialOutputUsdPerM)} className={input} />
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mono-label mb-2">Kemampuan</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {CAPABILITY_VALUES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm text-heading">
                <input type="checkbox" name={`cap_${c}`} defaultChecked={defaults.capabilities.includes(c)} className="size-4 accent-primary" />
                {CAPABILITY_LABEL[c]}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm text-heading sm:ml-auto">
              <input type="checkbox" name="visible" defaultChecked={defaults.visible} className="size-4 accent-primary" />
              Tampil di /models
            </label>
          </div>
        </fieldset>
        <div className="space-y-3 sm:col-span-2">
          <FormResult error={state.error} ok={state.ok} />
          <Button type="submit" disabled={pending} className="h-10 px-4 text-sm font-semibold">
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Simpan metadata
          </Button>
        </div>
      </form>
    </Card>
  );
}
