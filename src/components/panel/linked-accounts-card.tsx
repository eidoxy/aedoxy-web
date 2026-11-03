"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { FormMessage } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";

type Provider = "google" | "github";
type LinkedAccount = { id: string; providerId: string };

const LABELS: Record<string, string> = { credential: "Kata sandi", google: "Google", github: "GitHub" };
const KEY = ["linked-accounts"] as const;
const GENERIC_ERROR = "Terjadi kesalahan. Coba lagi sebentar lagi.";

/**
 * "Akun tertaut": the ways this account can sign in. `providers` says which social logins the server has configured
 * (decided on the server; the client never reads env). The last remaining method cannot be removed: Better Auth's
 * /unlink-account refuses it (FAILED_TO_UNLINK_LAST_ACCOUNT), the disabled button below is only a hint.
 */
export function LinkedAccountsCard({ providers }: { providers: Provider[] }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string>();
  const [confirming, setConfirming] = useState<LinkedAccount | null>(null);

  const accounts = useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await authClient.listAccounts();
      if (error || !data) throw new Error("list failed");
      return data.map((a): LinkedAccount => ({ id: a.id, providerId: a.providerId }));
    },
  });

  const link = useMutation({
    mutationFn: async (provider: Provider) => {
      const { error } = await authClient.linkSocial({ provider, callbackURL: "/settings", errorCallbackURL: "/settings" });
      if (error) throw new Error("link failed");
    },
    onMutate: () => setMessage(undefined),
    onError: () => setMessage(`Belum bisa menautkan akun. ${GENERIC_ERROR}`),
  });

  const unlink = useMutation({
    mutationFn: async (account: LinkedAccount) => {
      const { error } = await authClient.unlinkAccount({ accountId: account.id });
      if (error) throw error;
    },
    onMutate: () => setMessage(undefined),
    onSuccess: async () => {
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (err: { code?: string }) => {
      setConfirming(null);
      setMessage(err.code === "FAILED_TO_UNLINK_LAST_ACCOUNT" ? "Ini satu-satunya cara masuk Anda, jadi tidak bisa dilepas." : GENERIC_ERROR);
    },
  });

  if (accounts.isPending) {
    return (
      <div className="space-y-3" role="status" aria-label="Memuat akun tertaut">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  }
  if (accounts.isError) return <FormMessage tone="error">Akun tertaut belum bisa dimuat. Muat ulang halaman ini.</FormMessage>;

  const linked = accounts.data;
  const linkedIds = new Set(linked.map((a) => a.providerId));
  const available = providers.filter((p) => !linkedIds.has(p));
  const onlyOne = linked.length <= 1;

  return (
    <div>
      <ul>
        {linked.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-4 border-t border-line py-3 first:border-t-0 first:pt-0">
            <span className="flex items-center gap-2 text-sm text-fg">
              <KeyRound className="size-4 text-fg-muted" aria-hidden />
              {LABELS[a.providerId] ?? a.providerId}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={onlyOne || unlink.isPending}
              title={onlyOne ? "Satu-satunya cara masuk tidak bisa dilepas" : undefined}
              onClick={() => setConfirming(a)}
            >
              Lepas
            </Button>
          </li>
        ))}
        {available.map((p) => (
          <li key={p} className="flex items-center justify-between gap-4 border-t border-line py-3">
            <span className="text-sm text-fg-muted">{LABELS[p]} (belum tertaut)</span>
            <Button type="button" variant="outline" size="sm" disabled={link.isPending} onClick={() => link.mutate(p)}>
              {link.isPending && link.variables === p && <Loader2 className="animate-spin" aria-hidden />}
              Tautkan
            </Button>
          </li>
        ))}
      </ul>
      <FormMessage tone="error">{message}</FormMessage>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && !unlink.isPending && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lepas {confirming ? (LABELS[confirming.providerId] ?? confirming.providerId) : ""}?</DialogTitle>
            <DialogDescription>Anda tidak bisa lagi masuk dengan cara ini. Cara masuk lain tetap berfungsi.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={unlink.isPending} onClick={() => setConfirming(null)}>
              Kembali
            </Button>
            <Button type="button" disabled={unlink.isPending} onClick={() => confirming && unlink.mutate(confirming)}>
              {unlink.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Ya, lepas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
