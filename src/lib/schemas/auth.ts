import { z } from "zod";
import { USERNAME_MAX, USERNAME_MIN, usernameProblem } from "@/lib/username";

const email = z.string().trim().min(1, "Email wajib diisi").max(254).pipe(z.email("Format email tidak valid"));

/** Mirrors `minPasswordLength` in src/server/auth.ts; the server stays the authority. */
export const PASSWORD_MIN = 10;
const newPassword = z
  .string()
  .min(PASSWORD_MIN, `Kata sandi minimal ${PASSWORD_MIN} karakter`)
  .max(128, "Kata sandi maksimal 128 karakter");

/** Lowercased here as well as on the server, so "Ada_1" and "ada_1" are the same name everywhere. */
const username = z
  .string()
  .trim()
  .toLowerCase()
  .superRefine((value, ctx) => {
    const problem = usernameProblem(value);
    if (problem === "length") ctx.addIssue({ code: "custom", message: `Username ${USERNAME_MIN} sampai ${USERNAME_MAX} karakter` });
    else if (problem === "format") ctx.addIssue({ code: "custom", message: "Username hanya boleh huruf kecil, angka, dan garis bawah (_)" });
    else if (problem === "reserved") ctx.addIssue({ code: "custom", message: "Username ini tidak tersedia" });
  });

/** "Username atau email": an `@` means email, anything else is a username. */
export const isEmailIdentifier = (identifier: string) => identifier.includes("@");

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Username atau email wajib diisi").max(254),
  password: z.string().min(1, "Kata sandi wajib diisi").max(128),
});

export const registerSchema = z.object({
  username,
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
