"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { deleteModelMetaAction } from "@/app/(admin)/admin/models/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, dataColumns } from "@/components/ui/data-table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatTokens } from "@/lib/format";
import type { AdminFormState } from "@/server/admin-action";
import { FormResult } from "./totp-field";

export type ModelTableRow = {
  id: number;
  modelName: string;
  provider: string;
  contextIn: number | null;
  contextOut: number | null;
  capabilities: string[];
  officialInputUsdPerM: string | null;
  officialOutputUsdPerM: string | null;
  visible: boolean;
};

const col = dataColumns<ModelTableRow>();

const buildColumns = (onDelete: (modelName: string) => void) => col.columns([
  col.accessor("modelName", { header: "Model", cell: (c) => <span title={c.getValue()} className="inline-block max-w-64 truncate align-bottom font-mono text-xs">{c.getValue()}</span> }),
  col.accessor("provider", { header: "Provider", cell: (c) => <span title={c.getValue()} className="inline-block max-w-40 truncate align-bottom">{c.getValue()}</span> }),
  col.accessor((m) => m.contextIn ?? 0, {
    id: "context",
    header: "Context in / out",
    enableGlobalFilter: false,
    cell: (c) => {
      const m = c.row.original;
      return (
        <span className="font-mono text-xs">
          {m.contextIn === null ? "-" : formatTokens(m.contextIn)} / {m.contextOut === null ? "-" : formatTokens(m.contextOut)}
        </span>
      );
    },
  }),
  col.accessor((m) => m.capabilities.join(", "), { id: "capabilities", header: "Kemampuan", cell: (c) => <span title={c.getValue()} className="inline-block max-w-56 truncate align-bottom text-fg-muted">{c.getValue() || "-"}</span> }),
  col.accessor((m) => Number(m.officialInputUsdPerM ?? 0), {
    id: "official",
    header: "Resmi in / out",
    enableGlobalFilter: false,
    cell: (c) => {
      const m = c.row.original;
      return (
        <span className="font-mono text-xs">
          {m.officialInputUsdPerM === null ? "-" : `$${Number(m.officialInputUsdPerM)}`} / {m.officialOutputUsdPerM === null ? "-" : `$${Number(m.officialOutputUsdPerM)}`}
        </span>
      );
    },
  }),
  col.accessor((m) => (m.visible ? "Ya" : "Disembunyikan"), {
    id: "visible",
    header: "Tampil",
    cell: (c) => <Badge variant={c.row.original.visible ? "secondary" : "outline"}>{c.getValue()}</Badge>,
  }),
  col.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    meta: { align: "right" },
    cell: (c) => {
      const name = c.row.original.modelName;
      return (
        <span className="inline-flex items-center gap-4">
          <Link href={`/admin/models?edit=${encodeURIComponent(name)}`} className="text-sm text-primary-ink underline-offset-4 hover:underline">
            Ubah
          </Link>
          <button type="button" onClick={() => onDelete(name)} aria-label={`Hapus metadata ${name}`} className="text-sm text-danger underline-offset-4 hover:underline">
            Hapus
          </button>
        </span>
      );
    },
  }),
]);

export function ModelsTable({ rows }: { rows: ModelTableRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [target, setTarget] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const columns = useMemo(() => buildColumns((name) => { setDone(null); setTarget(name); }), []);

  // The table row disappears after a delete, so the dialog and its result live here, outside the rows.
  const onDeleted = (name: string, message: string) => {
    setTarget(null);
    setDone(message);
    if (searchParams.get("edit") === name || searchParams.get("model") === name) router.replace("/admin/models");
  };

  return (
    <>
      {done && <FormResult ok={done} />}
      <DataTable data={rows} columns={columns} caption="Metadata model tersimpan" searchLabel="Cari model" getRowId={(m) => m.modelName} empty="Belum ada metadata." />
      <DeleteModelMetaDialog modelName={target} onClose={() => setTarget(null)} onDeleted={onDeleted} />
    </>
  );
}

/** Confirmation for one row. Keyed by model name so the result state is fresh for each row. */
function DeleteModelMetaDialog({ modelName, onClose, onDeleted }: { modelName: string | null; onClose: () => void; onDeleted: (name: string, message: string) => void }) {
  return (
    <Dialog open={modelName !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{modelName !== null && <DeleteForm key={modelName} modelName={modelName} onDeleted={onDeleted} />}</DialogContent>
    </Dialog>
  );
}

function DeleteForm({ modelName, onDeleted }: { modelName: string; onDeleted: (name: string, message: string) => void }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(async (prev, fd) => {
    const next = await deleteModelMetaAction(prev, fd);
    if (next.ok) onDeleted(modelName, next.ok);
    return next;
  }, {});
  return (
    <>
      <DialogHeader>
        <DialogTitle>Hapus metadata {modelName}?</DialogTitle>
        <DialogDescription>
          Yang dihapus hanya metadata (provider, context, kemampuan, harga resmi, status tampil). Modelnya tetap ada di gateway dan tetap tampil di /models tanpa metadata sampai Anda mengisinya lagi. Katalog publik
          diperbarui segera. Tindakan ini tidak dapat dibatalkan, tetapi metadata bisa diisi ulang.
        </DialogDescription>
      </DialogHeader>
      <form action={action} className="space-y-4">
        <input type="hidden" name="modelName" value={modelName} />
        <FormResult error={state.error} />
        <DialogFooter>
          <Button type="submit" variant="destructive" disabled={pending} className="h-10 px-4 text-sm font-semibold">
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Hapus metadata
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}