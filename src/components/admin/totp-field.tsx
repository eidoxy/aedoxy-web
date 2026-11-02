"use client";

import { Fingerprint } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useWebAuthnSupport } from "@/lib/use-webauthn-support";
import { Field } from "./common";
import { useHasPasskey } from "./passkey-context";

// Must match STEP_UP_HEADER in src/server/passkey-policy.ts (that file is server-only).
const STEP_UP_HEADER = "x-aedoxy-step-up";

/**
 * Fresh 2FA proof for a sensitive action. Verified on the server, never trusted from the UI: either the
 * typed code (field `totp`), or a passkey assertion that the server stores for this session (single use,
 * 5 minutes). After a passkey assertion the field may stay empty.
 */
export function TotpField({ id = "totp", error }: { id?: string; error?: string }) {
  const webauthn = useWebAuthnSupport();
  const hasPasskey = useHasPasskey();
  const supported = webauthn && hasPasskey;
  const inputRef = useRef<HTMLInputElement>(null);
  const [verified, setVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string>();

  // Any submit spends or discards the proof, so ask again next time.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const reset = () => setVerified(false);
    form.addEventListener("submit", reset);
    return () => form.removeEventListener("submit", reset);
  }, []);

  async function usePasskey() {
    setBusy(true);
    setPasskeyError(undefined);
    const { error: err } = await authClient.signIn.passkey({ fetchOptions: { headers: { [STEP_UP_HEADER]: "1" } } });
    setBusy(false);
    if (err) return setPasskeyError("Passkey tidak cocok, dibatalkan, atau belum terdaftar. Pakai kode 2FA.");
    setVerified(true);
  }

  return (
    <Field label="Kode 2FA" htmlFor={id} hint="6 digit dari aplikasi autentikator, atau kode cadangan." error={error ?? passkeyError}>
      <Input ref={inputRef} id={id} name="totp" inputMode="numeric" autoComplete="one-time-code" required={!verified} className="h-9 bg-background" />
      {supported && (
        <div className="mt-2">
          {verified ? (
            <p role="status" className="text-xs text-success">
              Passkey terverifikasi. Kirim formulir dalam 5 menit.
            </p>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={usePasskey} disabled={busy}>
              <Fingerprint className="size-4" aria-hidden />
              Gunakan passkey
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}

/** Form-level result line. */
export function FormResult({ error, ok }: { error?: string; ok?: string }) {
  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    );
  if (ok)
    return (
      <p role="status" className="text-sm text-success">
        {ok}
      </p>
    );
  return null;
}
