import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, AuthCardFallback } from "@/components/auth/auth-ui";
import { RegisterForm } from "@/components/auth/register-form";
import { SignedInGate } from "@/components/auth/signed-in-gate";
import { getSiteSettings } from "@/server/site";

export const metadata: Metadata = { title: "Daftar" };

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { brandName } = await getSiteSettings();
  return (
    <Suspense fallback={<AuthCardFallback />}>
      <SignedInGate searchParams={searchParams}>
        <AuthCard
          title="Daftar"
          description={`Satu akun untuk ${brandName} dan console API.`}
          footer={
            <p>
              Sudah punya akun?{" "}
              <Link href="/login" className="font-medium text-primary-ink underline-offset-4 hover:underline">
                Masuk
              </Link>
            </p>
          }
        >
          <RegisterForm />
        </AuthCard>
      </SignedInGate>
    </Suspense>
  );
}
