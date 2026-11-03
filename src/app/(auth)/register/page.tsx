import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, AuthCardFallback } from "@/components/auth/auth-ui";
import { RegisterForm } from "@/components/auth/register-form";
import { SignedInGate } from "@/components/auth/signed-in-gate";
import { oidcCarryQuery } from "@/lib/auth-redirect";
import { getSiteSettings } from "@/server/site";
import { getSocialProviders } from "@/server/social-providers";

export const metadata: Metadata = { title: "Daftar" };

export default function RegisterPage({ searchParams }: PageProps<"/register">) {
  return (
    <Suspense fallback={<AuthCardFallback />}>
      <SignedInGate searchParams={searchParams}>
        <Register searchParams={searchParams} />
      </SignedInGate>
    </Suspense>
  );
}

// Inside the Suspense boundary: the providers depend on server env and the admin switches, which must not be frozen into the prerendered shell.
async function Register({ searchParams }: Pick<PageProps<"/register">, "searchParams">) {
  const [params, { brandName }, providers] = await Promise.all([searchParams, getSiteSettings(), getSocialProviders()]);
  return (
    <AuthCard
      title="Daftar"
      description={`Satu akun untuk ${brandName} dan console API.`}
      footer={
        <p>
          Sudah punya akun?{" "}
          <Link href={`/login${oidcCarryQuery(params)}`} className="font-medium text-primary-ink underline-offset-4 hover:underline">
            Masuk
          </Link>
        </p>
      }
    >
      <RegisterForm providers={providers} />
    </AuthCard>
  );
}
