"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { FormMessage, TextField } from "@/components/auth/auth-ui";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN, resetPasswordSchema, type ResetPasswordValues } from "@/lib/schemas/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordValues>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: "", confirm: "" } });

  async function onSubmit(values: ResetPasswordValues) {
    setFormError(undefined);
    const { error } = await authClient.resetPassword({ newPassword: values.password, token });
    if (error) {
      setFormError("Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.");
      return;
    }
    router.push("/login?reset=1");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-1">
      <TextField
        id="password"
        label="Kata sandi baru"
        type="password"
        autoComplete="new-password"
        hint={`Minimal ${PASSWORD_MIN} karakter.`}
        error={errors.password?.message}
        {...register("password")}
      />
      <TextField
        id="confirm"
        label="Ulangi kata sandi"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register("confirm")}
      />
      <FormMessage tone="error">{formError}</FormMessage>
      <Button type="submit" disabled={isSubmitting} className="mt-2 h-11 w-full text-sm font-semibold">
        {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {isSubmitting ? "Menyimpan..." : "Simpan kata sandi"}
      </Button>
    </form>
  );
}
