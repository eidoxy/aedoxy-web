"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormMessage, TextField } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN, registerSchema, type RegisterValues } from "@/lib/schemas/auth";

export function RegisterForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema), defaultValues: { name: "", email: "", password: "" } });

  async function onSubmit(values: RegisterValues) {
    setFormError(undefined);
    const { error } = await authClient.signUp.email({ ...values, callbackURL: "/dashboard" });
    if (error) {
      setFormError(error.status === 429 ? "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." : "Pendaftaran gagal. Periksa data Anda lalu coba lagi.");
      return;
    }
    router.push(`/verify-email?email=${encodeURIComponent(values.email)}&sent=1`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-1">
      <TextField id="name" label="Nama" autoComplete="name" error={errors.name?.message} {...register("name")} />
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
        autoComplete="new-password"
        hint={`Minimal ${PASSWORD_MIN} karakter.`}
        error={errors.password?.message}
        {...register("password")}
      />
      <FormMessage tone="error">{formError}</FormMessage>
      <Button type="submit" disabled={isSubmitting} className="mt-2 h-11 w-full text-sm font-semibold">
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {isSubmitting ? "Memproses..." : "Daftar"}
      </Button>
    </form>
  );
}
