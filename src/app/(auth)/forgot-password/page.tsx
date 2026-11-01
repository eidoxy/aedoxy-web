import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-ui";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Lupa kata sandi" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Lupa kata sandi"
      description="Masukkan email akun Anda. Kami kirim tautan untuk mengatur ulang kata sandi."
      footer={
        <p>
          Ingat kata sandi?{" "}
          <Link href="/login" className="font-medium text-primary-ink underline-offset-4 hover:underline">
            Masuk
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
