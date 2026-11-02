import { Input } from "@/components/ui/input";
import { Field } from "./common";

/** Fresh 2FA code for a sensitive action. Verified on the server, never trusted from the UI. */
export function TotpField({ id = "totp", error }: { id?: string; error?: string }) {
  return (
    <Field label="Kode 2FA" htmlFor={id} hint="6 digit dari aplikasi autentikator, atau kode cadangan." error={error}>
      <Input id={id} name="totp" inputMode="numeric" autoComplete="one-time-code" required className="h-9 bg-background" />
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
