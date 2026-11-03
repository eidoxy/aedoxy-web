import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, AuthCardFallback } from "@/components/auth/auth-ui";
import { LoginForm } from "@/components/auth/login-form";
import { SignedInGate } from "@/components/auth/signed-in-gate";

import { socialErrorMessage } from "@/lib/auth-messages";
import { oidcCarryQuery } from "@/lib/auth-redirect";
import { getSiteSettings } from "@/server/site";
import { getSocialProviders } from "@/server/social-providers";

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
  const [params, { brandName }, providers] = await Promise.all([searchParams, getSiteSettings(), getSocialProviders()]);
  const { reset, error } = params;
  const carry = oidcCarryQuery(params);
  return (
    <AuthCard
      title="Masuk"
      description={reset ? "Kata sandi sudah diganti. Silakan masuk dengan kata sandi baru." : `Masuk ke akun ${brandName} Anda.`}
      footer={
        <p>
          Belum punya akun?{" "}
          <Link href={`/register${carry}`} className="font-medium text-primary-ink underline-offset-4 hover:underline">
            Daftar
          </Link>
          {" · "}
          <Link href="/forgot-password" className="font-medium text-primary-ink underline-offset-4 hover:underline">
            Lupa kata sandi
          </Link>
        </p>
      }
    >
      <LoginForm providers={providers} initialError={socialErrorMessage(error)} />
    </AuthCard>
  );
}
