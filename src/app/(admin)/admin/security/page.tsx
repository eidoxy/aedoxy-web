import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/console/page-header";
import { FormPageSkeleton } from "@/components/console/skeletons";
import { SectionCard } from "@/components/console/section-card";
import { TwoFactorSetup } from "@/components/admin/two-factor-setup";
import { requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Keamanan" };

export default function SecurityPage() {
  return (
    <Suspense fallback={<FormPageSkeleton />}>
      <Security />
    </Suspense>
  );
}

async function Security() {
  // The only admin page open to an admin who has no 2FA yet.
  const session = await requireAdmin({ allowWithout2fa: true });
  const enabled = session.user.twoFactorEnabled === true;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Keamanan" />
      {enabled ? (
        <SectionCard
          title="Autentikasi dua faktor aktif"
          description="Aksi sensitif (ubah pool, ubah paket, coba lagi fulfillment) meminta kode 6 digit dari aplikasi autentikator Anda, atau salah satu kode cadangan."
        >
          <p className="text-sm text-success">2FA aktif untuk akun ini.</p>
        </SectionCard>
      ) : (
        <SectionCard title="Aktifkan autentikasi dua faktor" description="Halaman admin lain terkunci sampai 2FA aktif.">
          <TwoFactorSetup />
        </SectionCard>
      )}
    </div>
  );
}
