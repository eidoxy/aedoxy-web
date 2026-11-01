import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard, AuthCardFallback } from "@/components/auth/auth-ui";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Atur ulang kata sandi" };

export default function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  return (
    <Suspense fallback={<AuthCardFallback />}>
      <ResetPassword searchParams={searchParams} />
    </Suspense>
  );
}

async function ResetPassword({ searchParams }: Pick<PageProps<"/reset-password">, "searchParams">) {
  const { token, error } = await searchParams;
  // Better Auth redirects here with ?token=... on success and ?error=INVALID_TOKEN otherwise.
  if (typeof token !== "string" || !token || error) {
    return (
      <AuthCard title="Tautan tidak valid" description="Tautan pengaturan ulang kata sandi tidak valid atau sudah kedaluwarsa.">
        <Button asChild className="h-11 w-full text-sm font-semibold">
          <Link href="/forgot-password">Minta tautan baru</Link>
        </Button>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Atur ulang kata sandi" description="Pilih kata sandi baru untuk akun Anda.">
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
