"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { buyPlan, type BuyPlanState } from "@/app/(panel)/plans/actions";
import { FormMessage } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { UsdIdr } from "@/components/usd-idr";
import { canContinue, type BuySummary } from "@/lib/buy-summary";
import { formatIdr, formatUsd, QUOTA_PER_USD } from "@/lib/format";
import type { FxRate } from "@/server/catalog/types";

const endDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-line py-2 first:border-t-0">
      <dt className="mono-label shrink-0">{label}</dt>
      <dd className="min-w-0 text-right text-heading">{children}</dd>
    </div>
  );
}

/**
 * "Beli" opens a confirmation dialog; only "Lanjut ke pembayaran" submits the form to `buyPlan`.
 * The dialog also holds the plan-replacement checkbox and warns about an unpaid order.
 */
export function PlanBuyForm({ planId, summary, fx, disabled, promoCode }: { planId: number; summary: BuySummary; fx: FxRate | null; disabled?: boolean; promoCode?: string }) {
  const [state, action, pending] = useActionState<BuyPlanState, FormData>(buyPlan, {});
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // The server can demand the replacement even when the page could not see an active plan (console was unreachable).
  const replace = summary.replace ?? (state.needsReplace ? { ...state.needsReplace, remainingUsd: state.needsReplace.remainingQuota / QUOTA_PER_USD } : null);
  const pendingOrderId = summary.pendingOrderId ?? state.pendingOrderId ?? null;
  const enabled = canContinue({ replaceRequired: replace !== null, replaceConfirmed: confirmed, pendingOrderId, busy: pending, disabled });
  const checkboxId = `replace-${planId}`;

  return (
    <div className="mt-6">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return; // the order is being created; closing now would hide the outcome
          setOpen(next);
          if (!next) setConfirmed(false);
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" disabled={disabled} className="h-11 w-full text-sm font-semibold">
            {disabled ? "Stok habis" : "Beli"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <form action={action} className="grid gap-4">
            <input type="hidden" name="planId" value={planId} />
            {promoCode && <input type="hidden" name="promoCode" value={promoCode} />}

            <DialogHeader>
              <DialogTitle>Konfirmasi pembelian</DialogTitle>
              <DialogDescription>Periksa pesanan Anda sebelum lanjut ke pembayaran QRIS.</DialogDescription>
            </DialogHeader>

            <dl className="text-sm">
              <Row label="Paket">{summary.name}</Row>
              <Row label="Masa berlaku">
                {summary.periodLabel}, {summary.validity}
              </Row>
              <Row label="Kredit">
                {formatUsd(summary.creditUsd)} <UsdIdr usd={summary.creditUsd} fx={fx} className="ml-1" />
              </Row>
              {summary.strikeIdr !== null && (
                <Row label="Harga normal">
                  <s className="text-faint">{formatIdr(summary.strikeIdr)}</s>
                </Row>
              )}
              {summary.promoLabel && (
                <Row label="Promo">
                  {summary.promoLabel}
                  {summary.discountIdr > 0 && <span className="block text-xs text-fg-muted">Potongan {formatIdr(summary.discountIdr)}</span>}
                </Row>
              )}
              <Row label="Total bayar">
                <span className="text-base font-medium">{formatIdr(summary.finalIdr)}</span>
              </Row>
            </dl>

            {replace && (
              <div className="rounded-xl border border-line bg-alt p-3.5">
                <p className="flex items-start gap-2 text-sm text-fg-soft">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                  <span>
                    Paket lama akan diganti. {replace.planName} (sisa kredit {formatUsd(replace.remainingQuota / QUOTA_PER_USD)}, berakhir {endDate.format(new Date(replace.endsAt))}) berhenti
                    sekarang dan sisa kreditnya hangus.
                  </span>
                </p>
                <label htmlFor={checkboxId} className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-heading">
                  <input
                    id={checkboxId}
                    type="checkbox"
                    name="replaceConfirmed"
                    required
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  Saya mengerti paket lama akan diganti
                </label>
              </div>
            )}

            {pendingOrderId && (
              <p role="status" className="flex items-start gap-2 rounded-xl border border-line bg-alt p-3.5 text-sm text-fg-soft">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <span>
                  Selesaikan atau batalkan pesanan yang belum dibayar dulu.{" "}
                  <Link href={`/orders/${pendingOrderId}`} className="font-medium text-primary-ink underline-offset-4 hover:underline">
                    Buka pesanan
                  </Link>
                </span>
              </p>
            )}

            <FormMessage tone="error">{state.error}</FormMessage>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  Batal
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!enabled}>
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Lanjut ke pembayaran
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
