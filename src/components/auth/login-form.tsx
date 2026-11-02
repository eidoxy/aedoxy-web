"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormMessage, TextField } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { loginSchema, type LoginValues } from "@/lib/schemas/auth";

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const [needsCode, setNeedsCode] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: LoginValues) {
    setFormError(undefined);
    const { data, error } = await authClient.signIn.email({ ...values, callbackURL: "/dashboard" });
    if (!error) {
      // An account with 2FA (admins) gets no session yet: ask for the code first.
      if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) setNeedsCode(true);
      return; // otherwise the client follows the redirect (dashboard, or back into the OIDC flow)
    }
    if (error.code === "EMAIL_NOT_VERIFIED") {
      router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
      return;
    }
    setFormError(error.status === 429 ? "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." : "Email atau kata sandi salah.");
  }

  async function google() {
    setFormError(undefined);
    const { error } = await authClient.signIn.social({ provider: "google", callbackURL: "/dashboard" });
    if (error) setFormError("Masuk dengan Google gagal. Coba lagi.");
  }

  if (needsCode) return <TwoFactorStep />;

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-1">
      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        error={errors.email?.message}
        {...register("email")}
      />
      <TextField
        id="password"
        label="Kata sandi"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register("password")}
      />
      <FormMessage tone="error">{formError}</FormMessage>
      <Button type="submit" disabled={isSubmitting} className="mt-2 h-11 w-full text-sm font-semibold">
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {isSubmitting ? "Memproses..." : "Masuk"}
      </Button>
      {googleEnabled && (
        <Button type="button" variant="outline" onClick={google} className="mt-2 h-11 w-full bg-surface text-sm font-semibold">
          Masuk dengan Google
        </Button>
      )}
    </form>
  );
}

/** Second sign-in step for accounts with 2FA: a 6-digit code, or a backup code (which has a dash). */
function TwoFactorStep() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const value = code.replace(/\s+/g, "");
    const { error: err } = /^\d{6}$/.test(value)
      ? await authClient.twoFactor.verifyTotp({ code: value })
      : await authClient.twoFactor.verifyBackupCode({ code: value });
    if (err) {
      setBusy(false);
      setError(err.status === 429 ? "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." : "Kode salah. Coba lagi.");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-1">
      <p className="mb-3 text-sm text-fg-muted">Masukkan kode 6 digit dari aplikasi autentikator, atau salah satu kode cadangan.</p>
      <TextField id="code" label="Kode 2FA" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} />
      <FormMessage tone="error">{error}</FormMessage>
      <Button type="submit" disabled={busy || !code.trim()} className="mt-2 h-11 w-full text-sm font-semibold">
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {busy ? "Memproses..." : "Verifikasi"}
      </Button>
    </form>
  );
}
