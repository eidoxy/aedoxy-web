"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { confirmPasskeyAddAction, deletePasskeyAction, type SecurityFormState } from "@/app/(admin)/admin/security/actions";
import { SectionCard } from "@/components/console/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useWebAuthnSupport } from "@/lib/use-webauthn-support";
import { Field } from "./common";
import { PasswordField } from "./two-factor-manage";
import { FormResult, TotpField } from "./totp-field";

export type PasskeyItem = { id: string; label: string; createdAt: string; kind: string };

function ceremonyMessage(err: { code?: string; message?: string }): string {
  switch (err.code) {
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
      return "Passkey ini sudah terdaftar di akun Anda.";
    case "PASSKEY_CONFIRMATION_REQUIRED":
      return "Konfirmasi kedaluwarsa. Isi kata sandi dan kode 2FA lagi.";
    case "ERROR_CEREMONY_ABORTED":
    case "AUTH_CANCELLED":
    case "REGISTRATION_CANCELLED":
      return "Pembuatan passkey dibatalkan.";
    case "USER_VERIFICATION_REQUIRED":
      return "Passkey harus memakai verifikasi pengguna (biometrik atau PIN).";
    default:
      return "Passkey belum bisa ditambahkan. Coba lagi.";
  }
}

function PasskeyRow({ item }: { item: PasskeyItem }) {
  const [state, action, pending] = useActionState<SecurityFormState, FormData>(deletePasskeyAction, {});
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-heading">{item.label}</p>
        <p className="text-xs text-faint">
          {item.kind} · dibuat {item.createdAt}
        </p>
        <FormResult error={state.error} />
      </div>
      {confirming ? (
        <form action={action} className="flex items-center gap-2">
          <input type="hidden" name="id" value={item.id} />
          <Button type="submit" variant="destructive" size="sm" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Ya, hapus
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
            Batal
          </Button>
        </form>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(true)}>
          Hapus
        </Button>
      )}
    </li>
  );
}

/** Lists the admin's passkeys and adds new ones: confirmation on the server first, then the browser ceremony. */
export function PasskeyCard({ items }: { items: PasskeyItem[] }) {
  const router = useRouter();
  const supported = useWebAuthnSupport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [ok, setOk] = useState<string>();

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setError(undefined);
    setOk(undefined);
    const confirmed = await confirmPasskeyAddAction({}, data);
    if (confirmed.error) {
      setBusy(false);
      return setError(confirmed.error);
    }
    const name = String(data.get("name") ?? "").trim() || undefined;
    const { error: err } = await authClient.passkey.addPasskey({ name });
    setBusy(false);
    if (err) return setError(ceremonyMessage(err));
    form.reset();
    setOk("Passkey ditambahkan.");
    router.refresh();
  }

  return (
    <SectionCard
      title="Passkey"
      description="Masuk tanpa kode 2FA dengan sidik jari, wajah, atau PIN perangkat. Passkey juga bisa menggantikan kode 2FA untuk aksi sensitif. 2FA tetap wajib untuk akses admin."
    >
      {items.length > 0 ? (
        <ul className="mb-6">
          {items.map((item) => (
            <PasskeyRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="mb-6 text-sm text-fg-muted">Belum ada passkey.</p>
      )}
      {supported ? (
        <form onSubmit={add} className="max-w-sm space-y-4">
          <Field label="Nama passkey (opsional)" htmlFor="passkey-name" hint="Contoh: Laptop kantor.">
            <Input id="passkey-name" name="name" maxLength={60} autoComplete="off" className="h-9 bg-background" />
          </Field>
          <PasswordField id="password-passkey" />
          <TotpField id="totp-passkey" />
          <FormResult error={error} ok={ok} />
          <Button type="submit" variant="outline" disabled={busy} className="h-10 px-4 text-sm font-semibold">
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Tambah passkey
          </Button>
        </form>
      ) : (
        <p role="alert" className="text-sm text-danger">
          Peramban ini tidak mendukung passkey (WebAuthn). Pakai peramban terbaru atau perangkat lain untuk menambah passkey.
        </p>
      )}
    </SectionCard>
  );
}
