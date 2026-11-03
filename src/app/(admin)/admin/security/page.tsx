import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/console/page-header";
import { FormPageSkeleton } from "@/components/console/skeletons";
import { SectionCard } from "@/components/console/section-card";
import { getAuthenticatorName } from "@better-auth/passkey";
import { adminDate } from "@/components/admin/common";
import { PasskeyCard, type PasskeyItem } from "@/components/admin/passkey-card";
import { BackupCodesCard, ResetTwoFactorCard } from "@/components/admin/two-factor-manage";
import { TwoFactorSetup } from "@/components/admin/two-factor-setup";
import { requireAdmin } from "@/server/admin";
import { listPasskeys } from "@/server/domain/passkeys";

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
  const passkeys: PasskeyItem[] = enabled
    ? (await listPasskeys(session.user.id)).map((p) => ({
        id: p.id,
        label: p.name || getAuthenticatorName(p.aaguid) || "Passkey",
        createdAt: p.createdAt ? adminDate.format(p.createdAt) : "-",
        kind: p.deviceType === "multiDevice" ? "Disinkronkan antar perangkat" : "Satu perangkat",
      }))
    : [];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Keamanan" />
      {enabled ? (
        <>
          <SectionCard
            title="Autentikasi dua faktor aktif"
            description="Mengganti kredensial (kode cadangan, passkey, reset 2FA) meminta kode 6 digit dari aplikasi autentikator Anda, atau salah satu kode cadangan. Perubahan konfigurasi tidak meminta kode."
          >
            <p className="text-sm text-success">2FA aktif untuk akun ini.</p>
          </SectionCard>
          <PasskeyCard items={passkeys} />
          <BackupCodesCard />
          <ResetTwoFactorCard />
        </>
      ) : (
        <SectionCard title="Aktifkan autentikasi dua faktor" description="Halaman admin lain terkunci sampai 2FA aktif.">
          <TwoFactorSetup />
        </SectionCard>
      )}
    </div>
  );
}
