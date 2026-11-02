"use client";

import { Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { saveSessionTrustAction, type SettingsState } from "@/app/(panel)/settings/actions";
import { TextField } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const endDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

/** "Percayai perangkat ini selama 30 hari". Turning it on asks for the password when the account has one. */
export function SessionTrustForm({ initialTrusted, hasPassword, expiresAt }: { initialTrusted: boolean; hasPassword: boolean; expiresAt: string }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSessionTrustAction, {});
  const [on, setOn] = useState(initialTrusted);
  const needsPassword = on && !initialTrusted && hasPassword;

  return (
    // The key remounts the form once the saved value changes, which also clears the password field.
    <form action={action} key={String(initialTrusted)}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <label htmlFor="trusted" className="text-base font-medium text-heading">
            Percayai perangkat ini selama 30 hari
          </label>
          <p id="trusted-desc" className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Tanpa opsi ini, sesi berakhir otomatis setelah 1 hari. Dengan opsi ini, sesi di perangkat dan peramban ini bertahan 30 hari sejak
            diaktifkan, lalu Anda masuk lagi. Sesi di perangkat lain tidak berubah. Matikan di perangkat bersama.
          </p>
        </div>
        <Switch id="trusted" name="trusted" checked={on} onCheckedChange={setOn} aria-describedby="trusted-desc" className="mt-0.5" />
      </div>

      <p className="mt-4 text-sm text-fg-muted">
        Sesi ini berakhir pada <span className="font-medium text-fg">{endDate.format(new Date(expiresAt))} WIB</span>.
      </p>

      {needsPassword && (
        <div className="mt-4 max-w-sm">
          <TextField id="trust-password" name="password" type="password" label="Kata sandi" autoComplete="current-password" required hint="Konfirmasi dengan kata sandi akun Anda." />
        </div>
      )}

      <div className="mt-5 flex items-center gap-4">
        <Button type="submit" disabled={pending || on === initialTrusted} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan
        </Button>
        {state.ok && (
          <p role="status" className="text-sm text-success">
            {state.ok}
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
