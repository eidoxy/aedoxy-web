import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { adminDate, Card } from "@/components/admin/common";
import { CONSOLE_LABEL } from "@/components/admin/admin-users-table";
import { UserActions } from "@/components/admin/user-actions";
import { PageHeader } from "@/components/console/page-header";
import { CardsPageSkeleton } from "@/components/console/skeletons";
import { Badge } from "@/components/ui/badge";
import { requireAdmin } from "@/server/admin";
import { getAdminUser } from "@/server/domain/admin-users";

export const metadata: Metadata = { title: "Detail pengguna" };

export default function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<CardsPageSkeleton cards={3} />}>
      <UserDetail params={params} />
    </Suspense>
  );
}

const when = (d: Date | null | undefined) => (d ? adminDate.format(d) : "-");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3 border-t border-line py-2 text-sm first:border-t-0">
      <dt className="mono-label">{label}</dt>
      <dd className="min-w-0 break-words text-heading">{children}</dd>
    </div>
  );
}

async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  const u = await getAdminUser(id);
  if (!u) notFound();
  const label = u.username ?? u.email;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pengguna"
        title={label}
        description={<Link href="/admin/users" className="text-primary-ink underline-offset-4 hover:underline">Kembali ke daftar pengguna</Link>}
        actions={u.ban.active ? <Badge variant="destructive">Diblokir</Badge> : <Badge variant="secondary">Aktif</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-medium text-heading">Profil</h2>
          <dl>
            <Row label="Username">{u.username ?? "-"}</Row>
            <Row label="Nama">{u.name}</Row>
            <Row label="Email">
              {u.email} · {u.emailVerified ? "terverifikasi" : "belum terverifikasi"}
            </Row>
            <Row label="Peran">{u.role}</Row>
            <Row label="2FA">{u.twoFactorEnabled ? "Aktif" : "Tidak aktif"}</Row>
            <Row label="Terdaftar">{when(u.createdAt)}</Row>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-2 text-lg font-medium text-heading">Akses</h2>
          <dl>
            <Row label="Metode login">{u.providers.length ? u.providers.join(", ") : "-"}</Row>
            <Row label="Sesi aktif">{u.activeSessions}</Row>
            <Row label="Blokir">{u.ban.active ? "Diblokir" : "Tidak diblokir"}</Row>
            {u.ban.active && (
              <>
                <Row label="Alasan">{u.ban.reason ?? "-"}</Row>
                <Row label="Berakhir">{u.ban.expires ? when(u.ban.expires) : "Tanpa batas waktu"}</Row>
              </>
            )}
            <Row label="Console">{CONSOLE_LABEL[u.console]}</Row>
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-3 text-lg font-medium text-heading">Kelola akun</h2>
          <UserActions userId={u.id} isSelf={u.id === admin.user.id} banned={u.ban.active} role={u.role} label={label} />
          {u.id === admin.user.id && <p className="mt-3 text-xs text-faint">Ini akun Anda: blokir dan ubah peran tidak tersedia.</p>}
          <p className="mt-3 text-xs text-faint">Kata sandi, 2FA, dan passkey tidak dikelola di sini. Admin mengubah kredensialnya sendiri di Keamanan; untuk pengguna biasa pakai skrip operator.</p>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-2 text-lg font-medium text-heading">Order terbaru</h2>
          {u.recentOrders.length === 0 ? (
            <p className="text-sm text-fg-muted">Belum ada order.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {u.recentOrders.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/admin/orders/${o.id}`} className="font-mono text-xs text-primary-ink underline-offset-4 hover:underline">
                    {o.tradeNo}
                  </Link>
                  <span className="text-fg-muted">{o.planName ?? "-"}</span>
                  <Badge variant="secondary">{o.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
