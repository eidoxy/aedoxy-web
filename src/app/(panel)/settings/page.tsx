import { CheckCircle2, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/console/page-header";
import { InfoRow, SectionCard } from "@/components/console/section-card";
import { ActivityPreferenceForm } from "@/components/panel/activity-preference-form";
import { CopyButton } from "@/components/panel/copy-button";
import { Badge } from "@/components/ui/badge";
import { getShowActivity } from "@/server/domain/activity";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Pengaturan" };

export default function SettingsPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-72 rounded-[18px] border border-line bg-surface" />}>
      <Settings />
    </Suspense>
  );
}

async function Settings() {
  const { user } = await requireSession();
  const show = await getShowActivity(user.id);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Pengaturan" title="Pengaturan akun" description="Data akun Anda dan preferensi tampilan di feed aktivitas." />

      <SectionCard title="Akun" description="Data yang dipakai untuk masuk ke Aedoxy dan console.">
        <dl>
          <InfoRow label="Nama">{user.name}</InfoRow>
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

      <SectionCard title="Privasi" description="Atur apakah pembelian Anda boleh muncul di feed aktivitas.">
        <ActivityPreferenceForm initialShow={show} />
      </SectionCard>
    </div>
  );
}
