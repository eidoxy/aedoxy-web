"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { regenerateBackupCodesAction, resetTwoFactorAction, type SecurityFormState } from "@/app/(admin)/admin/security/actions";
import { SectionCard } from "@/components/console/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "./common";
import { FormResult, TotpField } from "./totp-field";

export function PasswordField({ id = "password" }: { id?: string }) {
  return (
    <Field label="Kata sandi akun" htmlFor={id}>
      <Input id={id} name="password" type="password" autoComplete="current-password" required maxLength={128} className="h-9 bg-background" />
    </Field>
  );
}

/** Makes 10 new backup codes. They are shown once, in this component's state only. */
export function BackupCodesCard() {
  const [state, action, pending] = useActionState<SecurityFormState, FormData>(regenerateBackupCodesAction, {});
  return (
    <SectionCard title="Kode cadangan" description="Dipakai bila aplikasi autentikator tidak tersedia. Membuat kode baru membuat semua kode lama hangus.">
      <form action={action} className="max-w-sm space-y-4">
        <PasswordField id="password-codes" />
        <TotpField id="totp-codes" />
        <FormResult error={state.error} ok={state.ok} />
        <Button type="submit" variant="outline" disabled={pending} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Buat ulang kode cadangan
        </Button>
      </form>
      {state.codes && (
        <div className="mt-5 space-y-2">
          <p className="text-sm text-fg-soft">Simpan sekarang di tempat aman. Kode hanya ditampilkan sekali, dan tiap kode hanya berlaku satu kali.</p>
          <ul className="grid max-w-md grid-cols-2 gap-2 rounded-xl border border-line bg-alt p-4 font-mono text-sm text-heading">
            {state.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

/** Switches 2FA off, then the admin gate sends the admin through the normal enrolment again. */
export function ResetTwoFactorCard() {
  const router = useRouter();
  const [state, action, pending] = useActionState<SecurityFormState, FormData>(resetTwoFactorAction, {});
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);
  return (
    <SectionCard
      title="Atur ulang 2FA"
      description="Menonaktifkan 2FA lalu mendaftarkan ulang dengan perangkat baru. Sesi di perangkat lain keluar, dan halaman admin terkunci sampai pendaftaran selesai."
    >
      <form action={action} className="max-w-sm space-y-4">
        <PasswordField id="password-reset" />
        <TotpField id="totp-reset" />
        <FormResult error={state.error} ok={state.ok} />
        <Button type="submit" variant="destructive" disabled={pending} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Nonaktifkan dan daftar ulang 2FA
        </Button>
      </form>
    </SectionCard>
  );
}
