import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { param, type SearchParams } from "@/components/admin/common";
import { ModelMetaForm } from "@/components/admin/model-meta-form";
import { PageHeader } from "@/components/console/page-header";
import { TableCard } from "@/components/console/table-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatTokens } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getCatalog } from "@/server/catalog";
import { listModelMeta } from "@/server/domain/admin-models";

export const metadata: Metadata = { title: "Model" };

export default function ModelsAdminPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <ModelsAdmin searchParams={searchParams} />
    </Suspense>
  );
}

async function ModelsAdmin({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const pick = param(sp.edit) ?? param(sp.model);
  const [metas, catalog] = await Promise.all([listModelMeta(), getCatalog()]);

  const editing = metas.find((m) => m.modelName === pick);
  const defaults = editing ?? { modelName: pick ?? "", provider: "", contextIn: null, contextOut: null, capabilities: [], officialInputUsdPerM: null, officialOutputUsdPerM: null, visible: true };
  const known = new Set(metas.map((m) => m.modelName));
  const missing = catalog.models.filter((m) => !known.has(m.id));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Metadata model"
        description={
          <>
            Daftar dan biaya kredit model datang dari New API. Di sini Anda mengisi yang tidak disimpan New API: provider, context, kemampuan, dan harga resmi.
            {catalog.state !== "ok" && " Daftar model dari New API belum bisa dimuat sekarang."}
          </>
        }
      />

      <h2 className="text-xl font-medium tracking-[-0.02em] text-heading">{editing ? `Ubah ${editing.modelName}` : "Tambah / ubah metadata"}</h2>
      <ModelMetaForm key={defaults.modelName} defaults={defaults} />

      {missing.length > 0 && (
        <div>
          <h2 className="text-xl font-medium tracking-[-0.02em] text-heading">Model tanpa metadata</h2>
          <p className="mt-1 text-sm text-fg-muted">Tampil di /models dengan context dan kemampuan kosong sampai diisi.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {missing.map((m) => (
              <li key={m.id}>
                <Link href={`/admin/models?model=${encodeURIComponent(m.id)}`} className="rounded-full border border-line-strong px-3 py-1 font-mono text-xs text-fg-soft hover:text-heading">
                  {m.id}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="pt-4 text-xl font-medium tracking-[-0.02em] text-heading">Metadata tersimpan</h2>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Context in / out</TableHead>
              <TableHead>Kemampuan</TableHead>
              <TableHead>Resmi in / out</TableHead>
              <TableHead>Tampil</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metas.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-fg-muted">
                  Belum ada metadata.
                </TableCell>
              </TableRow>
            )}
            {metas.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-xs">{m.modelName}</TableCell>
                <TableCell>{m.provider}</TableCell>
                <TableCell className="font-mono text-xs">
                  {m.contextIn === null ? "-" : formatTokens(m.contextIn)} / {m.contextOut === null ? "-" : formatTokens(m.contextOut)}
                </TableCell>
                <TableCell className="text-fg-muted">{m.capabilities.join(", ") || "-"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {m.officialInputUsdPerM === null ? "-" : `$${Number(m.officialInputUsdPerM)}`} / {m.officialOutputUsdPerM === null ? "-" : `$${Number(m.officialOutputUsdPerM)}`}
                </TableCell>
                <TableCell>{m.visible ? <Badge variant="secondary">Ya</Badge> : <Badge variant="outline">Disembunyikan</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/admin/models?edit=${encodeURIComponent(m.modelName)}`} className="text-sm text-primary-ink underline-offset-4 hover:underline">
                    Ubah
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </div>
  );
}
