import { CheckCircle2, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { OpenConsoleButton } from "@/components/panel/open-console-button";
import { SignOutButton } from "@/components/panel/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-72 max-w-2xl rounded-[18px] border border-line bg-surface" />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const { user } = await requireSession();
  const linked = user.newapiUserId != null;

  return (
    <div className="max-w-2xl">
      <p className="eyebrow">Dashboard</p>
      <h1 className="mt-3 text-4xl font-medium tracking-[-0.04em] text-heading">Halo, {user.name}</h1>

      <dl className="mt-8 divide-y divide-line rounded-[18px] border border-line bg-surface">
        <div className="flex items-center justify-between gap-4 p-5">
          <dt className="mono-label">Email</dt>
          <dd className="flex min-w-0 items-center gap-2.5 text-sm text-fg">
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
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 p-5">
          <dt className="mono-label">Akun console</dt>
          <dd>
            {linked ? (
              <Badge variant="secondary">
                <CheckCircle2 aria-hidden /> Tertaut
              </Badge>
            ) : (
              <Badge variant="outline">Belum tertaut</Badge>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-6 space-y-3">
        <OpenConsoleButton />
        <p className="text-sm text-fg-muted">
          Di halaman masuk console, tekan tombol <span className="font-medium text-heading">Aedoxy</span> untuk masuk dengan akun ini.
        </p>
      </div>

      <div className="mt-10 border-t border-line pt-6">
        <SignOutButton />
      </div>
    </div>
  );
}
