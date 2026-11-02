"use client";

import { Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelMyOrder } from "@/app/(panel)/orders/actions";
import { FormMessage } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** "Batalkan pembayaran" with a confirmation dialog. `onDone` runs after the server answered, so the caller can refresh its status. */
export function CancelOrderButton({ orderId, size = "default", onDone }: { orderId: string; size?: "default" | "sm"; onDone?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setMessage(null);
    startTransition(async () => {
      let result;
      try {
        result = await cancelMyOrder(orderId);
      } catch {
        setMessage({ tone: "error", text: "Terjadi kesalahan. Coba lagi sebentar lagi." });
        return;
      }
      if (result.error) {
        setMessage({ tone: "error", text: result.error });
        return;
      }
      // Cancelled, or already paid: either way the order changed, so reload what the page shows.
      if (result.notice) setMessage({ tone: "info", text: result.notice });
      else setOpen(false);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (next) setMessage(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size={size} className={size === "sm" ? undefined : "h-10 bg-surface px-4 text-sm font-semibold"}>
          <XCircle aria-hidden /> Batalkan pembayaran
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan pesanan ini?</DialogTitle>
          <DialogDescription>QR yang sudah dibuat tidak akan dipakai lagi.</DialogDescription>
        </DialogHeader>
        {message && (
          <FormMessage tone={message.tone === "error" ? "error" : "success"}>{message.text}</FormMessage>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
            {message?.tone === "info" ? "Tutup" : "Kembali"}
          </Button>
          {message?.tone !== "info" && (
            <Button type="button" disabled={pending} onClick={confirm}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              Ya, batalkan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
