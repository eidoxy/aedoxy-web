import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader } from "@/components/admin/common";
import { TwoFactorSetup } from "@/components/admin/two-factor-setup";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Keamanan" };

export default function SecurityPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-72 rounded-[18px] border border-line bg-surface" />}>
      <Security />
    </Suspense>
  );
}

async function Security() {
  // The only admin page open to an admin who has no 2FA yet.
  const session = await requireAdmin({ allowWithout2fa: true });
  const enabled = session.user.twoFactorEnabled === true;

  return (
    <div>
      <PageHeader eyebrow="Admin" title="Keamanan" />
      <Card className="mt-8 max-w-2xl">
        {enabled ? (
          <>
            <h2 className="text-lg font-medium text-heading">Autentikasi dua faktor aktif</h2>
            <p className="mt-2 text-sm text-fg-muted">
              Aksi sensitif (ubah pool, ubah paket, coba lagi fulfillment) meminta kode 6 digit dari aplikasi autentikator Anda, atau salah satu kode cadangan.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-medium text-heading">Aktifkan autentikasi dua faktor</h2>
            <p className="mt-2 mb-6 text-sm text-fg-muted">Halaman admin lain terkunci sampai 2FA aktif.</p>
            <TwoFactorSetup />
          </>
        )}
      </Card>
    </div>
  );
}
