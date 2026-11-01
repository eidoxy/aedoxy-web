import { z } from "zod";

const email = z.string().trim().min(1, "Email wajib diisi").max(254).pipe(z.email("Format email tidak valid"));

/** Mirrors `minPasswordLength` in src/server/auth.ts; the server stays the authority. */
export const PASSWORD_MIN = 10;
const newPassword = z
  .string()
  .min(PASSWORD_MIN, `Kata sandi minimal ${PASSWORD_MIN} karakter`)
  .max(128, "Kata sandi maksimal 128 karakter");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Kata sandi wajib diisi").max(128),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter").max(80, "Nama maksimal 80 karakter"),
  email,
  password: newPassword,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Kata sandi tidak sama" });

export const resendVerificationSchema = z.object({ email });

export type LoginValues = z.infer<typeof loginSchema>;
export type RegisterValues = z.infer<typeof registerSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
export type ResendVerificationValues = z.infer<typeof resendVerificationSchema>;
