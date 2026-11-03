"use client";

import { Loader2, Pencil } from "lucide-react";
import { useActionState, useState } from "react";
import { setEnabledAction, setPriceAction } from "@/app/(admin)/admin/plans/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatIdr } from "@/lib/format";
import type { AdminFormState } from "@/server/admin-action";
import { Field } from "./common";
import { FormResult } from "./totp-field";

/** Inline flat-price edit in a confirmation dialog. */
export function PriceDialog({ planId, name, priceIdr }: { planId: number; name: string; priceIdr: number }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AdminFormState, FormData>(async (prev, fd) => {
    const next = await setPriceAction(prev, fd);
    if (next.ok) setOpen(false);
    return next;
  }, {});

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="group inline-flex items-center gap-1.5 font-mono hover:text-primary-ink" aria-label={`Ubah harga ${name}`}>
          {formatIdr(priceIdr)}
          <Pencil className="size-3 text-faint group-hover:text-primary-ink" aria-hidden />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ubah harga {name}</DialogTitle>
          <DialogDescription>Harga baru hanya berlaku untuk order baru. Order yang menunggu pembayaran tetap memakai harga lamanya. Tanpa sinkronisasi ulang.</DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="planId" value={planId} />
          <Field label="Harga flat (Rp)" htmlFor={`price-${planId}`} error={state.fieldErrors?.priceIdr?.[0]}>
            <Input id={`price-${planId}`} name="priceIdr" inputMode="numeric" defaultValue={String(priceIdr)} required className="h-9 bg-background" />
          </Field>
          <FormResult error={state.error} />
          <DialogFooter>
            <Button type="submit" disabled={pending} className="h-10 px-4 text-sm font-semibold">
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Simpan harga
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Enable / disable. Plans are never deleted. Opened from the row menu, so the caller owns `open`. */
export function EnabledDialog({ planId, name, enabled, open, onOpenChange }: { planId: number; name: string; enabled: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
  const setOpen = onOpenChange;
  const [state, action, pending] = useActionState<AdminFormState, FormData>(async (prev, fd) => {
    const next = await setEnabledAction(prev, fd);
    if (next.ok) setOpen(false);
    return next;
  }, {});
  const verb = enabled ? "Nonaktifkan" : "Aktifkan";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {verb} {name}?
          </DialogTitle>
          <DialogDescription>
            {enabled
              ? "Paket tidak bisa dibeli lagi. Riwayat order dan paket yang sudah aktif milik pembeli tidak berubah."
              : "Paket bisa dibeli setelah tersinkron ke New API."}
          </DialogDescription>
        </DialogHeader>
        <form action={action} className="space-y-4">
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="enabled" value={String(!enabled)} />
          <FormResult error={state.error} />
          <DialogFooter>
            <Button type="submit" variant={enabled ? "destructive" : "default"} disabled={pending} className="h-10 px-4 text-sm font-semibold">
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {verb}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
