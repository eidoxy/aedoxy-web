"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormMessage, TextField } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { resendVerificationSchema, type ResendVerificationValues } from "@/lib/schemas/auth";

export function ResendVerificationForm({ email }: { email: string }) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResendVerificationValues>({ resolver: zodResolver(resendVerificationSchema), defaultValues: { email } });

  async function onSubmit(values: ResendVerificationValues) {
    setFormError(undefined);
    setDone(false);
    const { error } = await authClient.sendVerificationEmail({ email: values.email, callbackURL: "/dashboard" });
    if (error) {
      setFormError(error.status === 429 ? "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." : "Email belum bisa dikirim. Coba lagi.");
      return;
    }
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
      <FormMessage tone="success">{done ? "Email verifikasi dikirim ulang. Cek inbox Anda." : undefined}</FormMessage>
      <Button type="submit" variant="outline" disabled={isSubmitting} className="mt-2 h-11 w-full bg-surface text-sm font-semibold">
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {isSubmitting ? "Mengirim..." : "Kirim ulang email verifikasi"}
      </Button>
    </form>
  );
}
