import { CheckCircle2, CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DitherPanel } from "@/components/brand/dither-panel";
import { PageHeader } from "@/components/console/page-header";
import { CopyButton } from "@/components/panel/copy-button";
import { OpenConsoleButton } from "@/components/panel/open-console-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/env";
import { formatRemaining, formatUsd, QUOTA_PER_USD } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getActivePlanForUser } from "@/server/domain/user-plan";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-72 rounded-[18px] border border-line bg-surface" />}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const { user } = await requireSession();
  const linked = user.newapiUserId != null;
  const plan = await getActivePlanForUser(user.id);
  const baseUrl = `${env.NEWAPI_PUBLIC_URL.replace(/\/+$/, "")}/v1`;
  const envLine = `OPENAI_BASE_URL=${baseUrl}`;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Dashboard" title={`Halo, ${user.name}`} description="Ringkasan paket dan akun Anda. Mulai dari sini untuk membuat API key dan memakai kredit." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden py-0 lg:col-span-2">
          <div className="grid sm:grid-cols-[minmax(0,1fr)_14rem]">
            <div className="flex flex-col gap-4 p-5">
              <p className="mono-label">Paket aktif</p>
              {plan ? (
                <div>
                  <p className="text-3xl leading-tight font-medium tracking-[-0.04em] text-heading">{plan.name}</p>
                  <p className="mt-2 text-sm text-fg-muted">
                    Kredit {formatUsd(plan.creditQuota / QUOTA_PER_USD)} · berakhir {formatRemaining(plan.endsAt)}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-xl font-medium tracking-[-0.03em] text-heading">Belum ada paket</p>
                  <p className="mt-2 text-sm text-fg-muted">Pilih paket kredit untuk mulai memanggil model lewat satu base URL.</p>
                  <Button asChild className="mt-4 h-10 px-4 text-sm font-semibold">
                    <Link href="/plans">Pilih paket</Link>
                  </Button>
                </div>
              )}
            </div>
            <DitherPanel seed={4} className="h-24 sm:h-auto" />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Akun terhubung</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <dt className="mono-label">Email</dt>
                <dd className="flex min-w-0 items-center gap-2 text-fg">
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
              <div className="flex items-center justify-between gap-3">
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
            <div className="space-y-3">
              <OpenConsoleButton />
              <p className="text-sm text-fg-muted">
                Di halaman masuk console, tekan tombol <span className="font-medium text-heading">Aedoxy</span> untuk masuk dengan akun ini.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mulai dalam 3 langkah</CardTitle>
          <CardDescription>Dari paket sampai panggilan API pertama.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="divide-y divide-line">
            <Step n={1} done={plan !== null} title="Pilih paket">
              <p>
                Kredit berlaku selama masa aktif paket.{" "}
                <Link href="/plans" className="text-primary-ink underline-offset-4 hover:underline">
                  Lihat paket
                </Link>
              </p>
            </Step>
            <Step n={2} done={linked} title="Buka console dan buat API key">
              <p>Tombol Buka Console di atas membawa Anda masuk. Buat API key di dalam console.</p>
            </Step>
            <Step n={3} title="Arahkan tool Anda ke base URL">
              <p>Isi variabel berikut di tool yang kompatibel dengan OpenAI, bersama API key Anda.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-alt px-3 py-2 font-mono text-xs whitespace-nowrap text-fg-soft">{envLine}</code>
                <CopyButton value={envLine} label="OPENAI_BASE_URL" />
              </div>
            </Step>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

/** One numbered step. `done` is omitted when the page cannot know (no status shown then). */
function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 py-4 first:pt-0 last:pb-0">
      <span
        aria-hidden
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs",
          done ? "border-transparent bg-primary-tint text-primary-ink" : "border-line-strong text-fg-muted",
        )}
      >
        {done ? <CheckCircle2 className="size-4" /> : n}
      </span>
      <div className="min-w-0 flex-1 text-sm text-fg-muted">
        <p className="flex flex-wrap items-center gap-2 font-medium text-heading">
          {title}
          {done !== undefined && <Badge variant={done ? "secondary" : "outline"}>{done ? "Selesai" : "Belum"}</Badge>}
        </p>
        <div className="mt-1 [&_p]:leading-relaxed">{children}</div>
      </div>
    </li>
  );
}
