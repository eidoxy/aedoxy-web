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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  async function onSubmit(values: LoginValues) {
    setFormError(undefined);
    const { error } = await authClient.signIn.email({ ...values, callbackURL: "/dashboard" });
    if (!error) return; // the client follows the redirect (dashboard, or back into the OIDC flow)
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
