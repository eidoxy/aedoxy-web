"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormMessage, TextField } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/schemas/auth";

export function ForgotPasswordForm() {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });

  async function onSubmit(values: ForgotPasswordValues) {
    setFormError(undefined);
    const { error } = await authClient.requestPasswordReset({ email: values.email, redirectTo: "/reset-password" });
    if (error?.status === 429) {
      setFormError("Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.");
      return;
    }
    // Same message whether or not the email exists, so the form cannot be used to probe accounts.
    setDone(true);
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
      <FormMessage tone="error">{formError}</FormMessage>
      <FormMessage tone="success">{done ? "Bila email terdaftar, tautan pengaturan ulang sudah dikirim. Cek inbox Anda." : undefined}</FormMessage>
      <Button type="submit" disabled={isSubmitting} className="mt-2 h-11 w-full text-sm font-semibold">
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {isSubmitting ? "Mengirim..." : "Kirim tautan"}
      </Button>
    </form>
  );
}
