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
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema), defaultValues: { username: "", email: "", password: "" } });

  async function onSubmit(values: RegisterValues) {
    setFormError(undefined);
    // Better Auth requires a name; it is the username, and the username plugin stores the lowercase form.
    const { error } = await authClient.signUp.email({ ...values, name: values.username, callbackURL: "/dashboard" });
    if (error) {
      // A taken username may be named outright; nothing here ever says whether an email is registered.
      setFormError(
        error.status === 429
          ? "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi."
          : error.code === "USERNAME_IS_ALREADY_TAKEN"
            ? "Username sudah dipakai. Pilih username lain."
            : "Pendaftaran gagal. Periksa data Anda lalu coba lagi.",
      );
      return;
    }
    router.push(`/verify-email?email=${encodeURIComponent(values.email)}&sent=1`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-1">
      <TextField
        id="username"
        label="Username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        hint="3 sampai 20 karakter: huruf kecil, angka, dan garis bawah (_)."
        error={errors.username?.message}
        {...register("username")}
      />
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
