"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { createPromoAction, stopPromoAction } from "@/app/(admin)/admin/promos/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { discountedAmount, isValidPromoValue, type PromoKind } from "@/lib/discount";
import { formatIdr } from "@/lib/format";
import type { AdminFormState } from "@/server/admin-action";
import { Card, Field, NativeSelect } from "./common";
import { FormResult, TotpField } from "./totp-field";

const input = "h-9 bg-background";

type PlanOption = { id: number; name: string; priceIdr: number };

export function PromoForm({ plans }: { plans: PlanOption[] }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(createPromoAction, {});
  const [kind, setKind] = useState<PromoKind>("percent");
  const [value, setValue] = useState("10");
  const [sampleId, setSampleId] = useState(plans[0]?.id ?? 0);
  const fe = state.fieldErrors ?? {};

  const sample = plans.find((p) => p.id === sampleId);
  const n = /^\d+$/.test(value) ? Number(value) : NaN;
  // The very function the order uses, so the preview cannot drift from what the buyer pays.
  const preview = sample && isValidPromoValue(kind, n) ? discountedAmount(sample.priceIdr, kind, n) : null;

  return (
    <form action={action} className="space-y-6">
      <Card className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama promo" htmlFor="name" error={fe.name?.[0]}>
          <Input id="name" name="name" required maxLength={80} className={input} />
        </Field>
        <Field label="Kode promo" htmlFor="code" hint="Kosong = diskon otomatis. Diisi = harus dimasukkan pembeli (huruf besar/kecil sama)." error={fe.code?.[0]}>
          <Input id="code" name="code" maxLength={32} autoComplete="off" className={input} />
        </Field>
        <Field label="Jenis" htmlFor="kind" error={fe.kind?.[0]}>
          <NativeSelect id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as PromoKind)}>
            <option value="percent">Persen (1-90%)</option>
            <option value="fixed">Nominal (Rp)</option>
          </NativeSelect>
        </Field>
        <Field label={kind === "percent" ? "Persen" : "Potongan (Rp)"} htmlFor="value" error={fe.value?.[0]}>
          <Input id="value" name="value" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} required className={input} />
        </Field>
        <Field label="Mulai (WIB)" htmlFor="startsAt" hint="Kosong = langsung." error={fe.startsAt?.[0]}>
          <Input id="startsAt" name="startsAt" type="datetime-local" className={input} />
        </Field>
        <Field label="Selesai (WIB)" htmlFor="endsAt" hint="Kosong = tanpa batas waktu." error={fe.endsAt?.[0]}>
          <Input id="endsAt" name="endsAt" type="datetime-local" className={input} />
        </Field>
        <Field label="Kuota total" htmlFor="maxRedemptions" hint="Kosong = tanpa batas." error={fe.maxRedemptions?.[0]}>
          <Input id="maxRedemptions" name="maxRedemptions" inputMode="numeric" className={input} />
        </Field>
        <Field label="Batas per user" htmlFor="perUserLimit" hint="Kosong = tanpa batas." error={fe.perUserLimit?.[0]}>
          <Input id="perUserLimit" name="perUserLimit" inputMode="numeric" defaultValue="1" className={input} />
        </Field>
      </Card>

      <Card>
        <p className="mono-label">Berlaku untuk</p>
        <p className="mt-1 text-xs text-faint">Tidak ada yang dicentang = semua paket.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {plans.map((p) => (
            <label key={p.id} className="flex items-center gap-2.5 text-sm text-heading">
              <input type="checkbox" name={`plan_${p.id}`} className="size-4 accent-primary" />
              {p.name} <span className="font-mono text-xs text-faint">{formatIdr(p.priceIdr)}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card>
        <p className="mono-label">Pratinjau harga</p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div className="min-w-48">
            <label htmlFor="sample" className="mono-label mb-1.5 block">
              Paket contoh
            </label>
            <NativeSelect id="sample" value={sampleId} onChange={(e) => setSampleId(Number(e.target.value))}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <p className="text-sm text-fg-muted" aria-live="polite">
            {!sample ? (
              "Belum ada paket."
            ) : preview ? (
              <>
                Harga flat {formatIdr(sample.priceIdr)}, potongan {formatIdr(preview.discountIdr)}, pembeli membayar{" "}
                <span className="font-medium text-heading">{formatIdr(preview.amountIdr)}</span> (dibulatkan ke atas per Rp100, minimal Rp10.000).
              </>
            ) : (
              "Isi nilai diskon yang valid untuk melihat pratinjau."
            )}
          </p>
        </div>
      </Card>

      <Card className="max-w-sm space-y-4">
        <TotpField />
        <FormResult error={state.error} ok={state.ok} />
        <Button type="submit" disabled={pending} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Buat promo
        </Button>
      </Card>
    </form>
  );
}

/** One row's "Hentikan": a confirmation dialog that asks for a fresh 2FA code before "Hentikan sekarang" submits. */
export function StopPromoDialog({ promoId, name }: { promoId: number; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AdminFormState, FormData>(async (prev, fd) => {
    const next = await stopPromoAction(prev, fd);
    if (next.ok) setOpen(false);
    return next;
  }, {});
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Hentikan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hentikan {name}?</DialogTitle>
          <DialogDescription>Promo tidak bisa dipakai lagi oleh order baru. Order yang sudah memegang pemakaian promo ini tetap berjalan sampai lunas atau kedaluwarsa.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="promoId" value={promoId} />
          <TotpField id={`totp-stop-${promoId}`} />
          <FormResult error={state.error} />
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending} className="h-10 px-4 text-sm font-semibold">
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Hentikan sekarang
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
