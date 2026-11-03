"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { useActionState, useState } from "react";
import { deleteUserAction, renameUserAction, resetUserPasskeysAction, resetUserTwoFactorAction, setUserPasswordAction } from "@/app/(admin)/admin/users/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/panel/copy-button";
import type { AdminFormState } from "@/server/admin-action";
import { Field } from "./common";
import { FormResult, TotpField } from "./totp-field";
import { ActionDialog } from "./user-actions";

const PASSWORD_MIN = 10;
const PASSWORD_MAX = 128;
const GENERATED_LENGTH = 20;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.!";

/** 20 characters from the browser's CSPRNG. Bytes at or above the largest multiple of the alphabet size are dropped, so no character is likelier than another. */
function generatePassword(): string {
  const limit = 256 - (256 % ALPHABET.length);
  let out = "";
  while (out.length < GENERATED_LENGTH) {
    for (const b of crypto.getRandomValues(new Uint8Array(GENERATED_LENGTH * 2))) {
      if (b < limit && out.length < GENERATED_LENGTH) out += ALPHABET[b % ALPHABET.length];
    }
  }
  return out;
}

function RenameForm({ userId, name }: { userId: string; name: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(renameUserAction, {});
  return (
    <form action={action} className="max-w-md space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <Field label="Nama tampilan" htmlFor={`name-${userId}`} hint="2 sampai 80 karakter. Nama di console tidak ikut berubah." error={state.fieldErrors?.name?.[0]}>
        <div className="flex gap-2">
          <Input id={`name-${userId}`} name="name" defaultValue={name} required minLength={2} maxLength={80} className="h-9 bg-background" />
          <Button type="submit" variant="outline" size="sm" disabled={pending} className="h-9">
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Ubah nama
          </Button>
        </div>
      </Field>
      <FormResult error={state.error} ok={state.ok} />
    </form>
  );
}

/** The new password. "Buat acak" fills a generated one and shows it in plain text so the admin can copy it; typed passwords stay masked. */
function PasswordInput({ userId, error }: { userId: string; error?: string }) {
  const [value, setValue] = useState("");
  const [generated, setGenerated] = useState(false);
  const id = `password-${userId}`;
  return (
    <Field label="Kata sandi baru" htmlFor={id} hint={`${PASSWORD_MIN} sampai ${PASSWORD_MAX} karakter.`} error={error}>
      <Input
        id={id}
        name="password"
        type={generated ? "text" : "password"}
        autoComplete="new-password"
        spellCheck={false}
        required
        minLength={PASSWORD_MIN}
        maxLength={PASSWORD_MAX}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setGenerated(false);
        }}
        className="h-9 bg-background font-mono"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setValue(generatePassword());
            setGenerated(true);
          }}
        >
          Buat acak
        </Button>
        {generated && <CopyButton value={value} label="kata sandi" />}
      </div>
      {generated && (
        <p role="status" className="mt-2 text-xs text-warn">
          Salin sekarang. Kata sandi ini hanya terlihat di dialog ini dan tidak disimpan di mana pun.
        </p>
      )}
    </Field>
  );
}

export type ManageProps = {
  userId: string;
  label: string;
  name: string;
  /** What the admin must type to delete: the username, or the email when there is none. */
  confirmWord: string;
  hasPassword: boolean;
  twoFactorEnabled: boolean;
  passkeyCount: number;
  pendingOrders: number;
  activePlan: { name: string; endsAt: string } | null;
};

export function UserManage({ userId, label, name, confirmWord, hasPassword, twoFactorEnabled, passkeyCount, pendingOrders, activePlan }: ManageProps) {
  return (
    <div className="space-y-5">
      <RenameForm userId={userId} name={name} />
      <div className="flex flex-wrap gap-2">
        <ActionDialog
          action={setUserPasswordAction}
          userId={userId}
          trigger="Atur kata sandi"
          title={`Atur kata sandi ${label}?`}
          description="Semua sesi pengguna dicabut dan pengguna diberi tahu lewat email. Kata sandi tidak dikirim lewat email: sampaikan sendiri lewat saluran yang aman."
          submit="Atur kata sandi"
        >
          {(state) => (
            <>
              {!hasPassword && (
                <Alert variant="warning">
                  <TriangleAlert aria-hidden />
                  <AlertTitle>Akun ini belum punya kata sandi</AlertTitle>
                  <AlertDescription>Pengguna masuk lewat Google atau GitHub. Aksi ini membuat login dengan kata sandi untuk akun ini.</AlertDescription>
                </Alert>
              )}
              <PasswordInput userId={userId} error={state.fieldErrors?.password?.[0]} />
              <TotpField id={`totp-password-${userId}`} />
            </>
          )}
        </ActionDialog>

        <ActionDialog
          action={resetUserTwoFactorAction}
          userId={userId}
          trigger="Reset 2FA"
          disabled={!twoFactorEnabled}
          title={`Reset 2FA ${label}?`}
          description="Rahasia 2FA dan kode cadangan dihapus, semua sesi dicabut, dan pengguna diberi tahu lewat email. Bila pengguna ini admin, ia mendaftar ulang 2FA di halaman Keamanan."
          submit="Reset 2FA"
          destructive
        >
          {() => <TotpField id={`totp-2fa-${userId}`} />}
        </ActionDialog>

        <ActionDialog
          action={resetUserPasskeysAction}
          userId={userId}
          trigger="Reset passkey"
          disabled={passkeyCount === 0}
          title={`Reset passkey ${label}?`}
          description={`${passkeyCount} passkey dihapus, semua sesi dicabut, dan pengguna diberi tahu lewat email.`}
          submit="Reset passkey"
          destructive
        >
          {() => <TotpField id={`totp-passkey-${userId}`} />}
        </ActionDialog>

        <ActionDialog
          action={deleteUserAction}
          userId={userId}
          trigger="Hapus akun"
          destructive
          title={`Hapus akun ${label}?`}
          description="Data pribadi dan semua metode masuk dihapus, email dan username bisa didaftarkan lagi. Baris pengguna dipertahankan untuk catatan pesanan dan keuangan. Tidak bisa dibatalkan."
          submit="Hapus akun"
        >
          {() => (
            <>
              <Alert variant="warning">
                <TriangleAlert aria-hidden />
                <AlertTitle>Akun console tidak dihapus</AlertTitle>
                <AlertDescription>Akun console dinonaktifkan; catatan di console dapat dihapus manual oleh admin console.</AlertDescription>
              </Alert>
              {activePlan && (
                <Alert variant="warning">
                  <TriangleAlert aria-hidden />
                  <AlertTitle>Pengguna punya paket aktif</AlertTitle>
                  <AlertDescription>
                    {activePlan.name}, berakhir {activePlan.endsAt}. Paket hangus bersama akses akun.
                  </AlertDescription>
                </Alert>
              )}
              {pendingOrders > 0 && (
                <p role="alert" className="text-sm text-danger">
                  Ada {pendingOrders} pesanan yang belum dibayar. Penghapusan ditolak sampai pesanan kedaluwarsa atau dibatalkan.
                </p>
              )}
              <Field label={`Ketik ulang "${confirmWord}" untuk konfirmasi`} htmlFor={`confirm-${userId}`}>
                <Input id={`confirm-${userId}`} name="confirm" autoComplete="off" spellCheck={false} required className="h-9 bg-background" />
              </Field>
            </>
          )}
        </ActionDialog>
      </div>
    </div>
  );
}
