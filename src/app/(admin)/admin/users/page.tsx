import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminUsersTable } from "@/components/admin/admin-users-table";
import { Card, Field, NativeSelect, PAGE_SIZE, Pagination, type SearchParams } from "@/components/admin/common";
import { PageHeader } from "@/components/console/page-header";
import { TablePageSkeleton } from "@/components/console/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/server/admin";
import { listAdminUsers, parseUserQuery } from "@/server/domain/admin-users";

export const metadata: Metadata = { title: "Pengguna" };

export default function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<TablePageSkeleton filters cols={8} />}>
      <Users searchParams={searchParams} />
    </Suspense>
  );
}

async function Users({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { filter, page } = parseUserQuery(await searchParams);
  const { rows, total } = await listAdminUsers(filter, page, PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Pengguna" description="Cari dan kelola pengguna aedoxy.com. Klik username untuk melihat detail dan mengelola akun." />
      <Card>
        <form method="get" className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
          <Field label="Cari username, email, atau nama" htmlFor="q">
            <Input id="q" name="q" defaultValue={filter.q ?? ""} maxLength={100} className="h-9 bg-background" />
          </Field>
          <Field label="Peran" htmlFor="role">
            <NativeSelect id="role" name="role" defaultValue={filter.role ?? ""}>
              <option value="">Semua</option>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </NativeSelect>
          </Field>
          <Field label="Status" htmlFor="status">
            <NativeSelect id="status" name="status" defaultValue={filter.status ?? ""}>
              <option value="">Semua</option>
              <option value="active">Aktif</option>
              <option value="banned">Diblokir</option>
            </NativeSelect>
          </Field>
          <Field label="Email terverifikasi" htmlFor="verified">
            <NativeSelect id="verified" name="verified" defaultValue={filter.verified ?? ""}>
              <option value="">Semua</option>
              <option value="yes">Ya</option>
              <option value="no">Belum</option>
            </NativeSelect>
          </Field>
          <Field label="Console" htmlFor="console">
            <NativeSelect id="console" name="console" defaultValue={filter.console ?? ""}>
              <option value="">Semua</option>
              <option value="linked">Tertaut</option>
              <option value="unlinked">Belum tertaut</option>
            </NativeSelect>
          </Field>
          <Button type="submit" className="h-9 px-4 text-sm font-semibold">
            Terapkan
          </Button>
        </form>
      </Card>

      <AdminUsersTable rows={rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString(), banExpires: u.banExpires?.toISOString() ?? null }))} />
      <Pagination basePath="/admin/users" params={filter} page={page} total={total} />
    </div>
  );
}
