import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, AuthCardFallback } from "@/components/auth/auth-ui";
import { LoginForm } from "@/components/auth/login-form";
import { SignedInGate } from "@/components/auth/signed-in-gate";
import { env } from "@/env";

export const metadata: Metadata = { title: "Masuk" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<AuthCardFallback />}>
      <SignedInGate searchParams={searchParams}>
        <Login searchParams={searchParams} />
      </SignedInGate>
    </Suspense>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { reset } = await searchParams;
  const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  return (
    <AuthCard
      title="Masuk"
      description={reset ? "Kata sandi sudah diganti. Silakan masuk dengan kata sandi baru." : "Masuk ke akun aedoxy Anda."}
      footer={
        <p>
          Belum punya akun?{" "}
          <Link href="/register" className="font-medium text-primary-ink underline-offset-4 hover:underline">
            Daftar
          </Link>
          {" · "}
          <Link href="/forgot-password" className="font-medium text-primary-ink underline-offset-4 hover:underline">
            Lupa kata sandi
          </Link>
        </p>
      }
    >
      <LoginForm googleEnabled={googleEnabled} />
    </AuthCard>
  );
}
