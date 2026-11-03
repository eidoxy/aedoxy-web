import { CheckCircle2, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/console/page-header";
import { FormPageSkeleton } from "@/components/console/skeletons";
import { InfoRow, SectionCard } from "@/components/console/section-card";
import { ActivityPreferenceForm } from "@/components/panel/activity-preference-form";
import { LinkedAccountsCard } from "@/components/panel/linked-accounts-card";
import { CopyButton } from "@/components/panel/copy-button";
import { Badge } from "@/components/ui/badge";
import { SessionTrustForm } from "@/components/panel/session-trust-form";
import { getShowActivity } from "@/server/domain/activity";
import { hasPasswordLogin } from "@/server/domain/session-trust";
import { requireSession } from "@/server/session";
import { getSocialProviders } from "@/server/social-providers";
import { getSiteSettings } from "@/server/site";

export const metadata: Metadata = { title: "Pengaturan" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<FormPageSkeleton />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const { user, session } = await requireSession();
  // Which social logins can be linked is decided here, on the server (env credentials AND the admin switch); the card only receives the names.
  const [show, passwordLogin, { brandName }, providers] = await Promise.all([getShowActivity(user.id), hasPasswordLogin(user.id), getSiteSettings(), getSocialProviders()]);
  const trustedAt = (session as { trustedAt?: Date | null }).trustedAt;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Pengaturan" title="Pengaturan akun" description="Data akun Anda dan preferensi tampilan di feed aktivitas." />

      <SectionCard title="Akun" description={`Data yang dipakai untuk masuk ke ${brandName} dan console.`}>
        <dl>
          <InfoRow label="Nama">{user.name}</InfoRow>
          {user.username && <InfoRow label="Username">{user.username}</InfoRow>}
          <InfoRow label="Email">
            <span className="truncate">{user.email}</span>
            {user.emailVerified ? (
              <Badge variant="secondary">
                <CheckCircle2 aria-hidden /> Terverifikasi
              </Badge>
            ) : (
              <Badge variant="destructive">
                <CircleAlert aria-hidden /> Belum diverifikasi
              </Badge>
            )}
          </InfoRow>
          <InfoRow label="Akun console">
            {user.newapiUserId != null ? (
              <Badge variant="secondary">
                <CheckCircle2 aria-hidden /> Tertaut
              </Badge>
            ) : (
              <Badge variant="outline">Belum tertaut</Badge>
            )}
          </InfoRow>
          <InfoRow label="ID akun">
            <span className="min-w-0 font-mono text-xs break-all">{user.id}</span>
            <CopyButton value={user.id} label="ID akun" />
          </InfoRow>
        </dl>
      </SectionCard>

      <SectionCard title="Akun tertaut" description="Cara Anda masuk ke akun ini. Tautkan Google atau GitHub dengan email yang sama.">
        <LinkedAccountsCard providers={providers} />
      </SectionCard>

      <SectionCard title="Sesi" description="Berapa lama Anda tetap masuk di perangkat ini.">
        <SessionTrustForm initialTrusted={Boolean(trustedAt)} hasPassword={passwordLogin} expiresAt={session.expiresAt.toISOString()} />
      </SectionCard>

      <SectionCard title="Privasi" description="Atur apakah pembelian Anda boleh muncul di feed aktivitas.">
        <ActivityPreferenceForm initialShow={show} />
      </SectionCard>
    </div>
  );
}
