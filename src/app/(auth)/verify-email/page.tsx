import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";
import { AuthCard, AuthCardFallback } from "@/components/auth/auth-ui";
import { ResendVerificationForm } from "@/components/auth/resend-verification-form";

export const metadata: Metadata = { title: "Verifikasi email" };

export default function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  return (
    <Suspense fallback={<AuthCardFallback />}>
      <VerifyEmail searchParams={searchParams} />
    </Suspense>
  );
}

async function VerifyEmail({ searchParams }: Pick<PageProps<"/verify-email">, "searchParams">) {
  const params = await searchParams;
  // Untrusted query value: only a valid email address is shown or prefilled.
  const parsed = z.email().safeParse(typeof params.email === "string" ? params.email : "");
  const email = parsed.success ? parsed.data : "";
  const sent = params.sent === "1";

  return (
    <AuthCard
      title="Cek inbox Anda"
      description={
        <>
          {sent ? "Kami mengirim tautan verifikasi" : "Email Anda belum terverifikasi. Kami bisa mengirim tautan verifikasi"}
          {email ? (
            <>
              {" "}ke <span className="font-medium text-heading">{email}</span>
            </>
          ) : null}
          . Buka tautan itu untuk mengaktifkan akun.
        </>
      }
      footer={
        <p>
          Sudah verifikasi?{" "}
          <Link href="/login" className="font-medium text-primary-ink underline-offset-4 hover:underline">
            Masuk
          </Link>
        </p>
      }
    >
      <ResendVerificationForm email={email} />
    </AuthCard>
  );
}
