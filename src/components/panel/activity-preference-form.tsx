"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { saveActivityPreferenceAction, type SettingsState } from "@/app/(panel)/settings/actions";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

/** "Tampilkan aktivitas saya" (F07 opt-out). Default on: the feed shows a masked name only. */
export function ActivityPreferenceForm({ initialShow }: { initialShow: boolean }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveActivityPreferenceAction, {});
  return (
    <form action={action}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <label htmlFor="show" className="text-base font-medium text-heading">
            Tampilkan aktivitas saya
          </label>
          <p id="show-desc" className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            Saat pembelian paket Anda berhasil, beranda dan halaman paket dapat menampilkan satu baris seperti &ldquo;R•••a berlangganan
            Bulanan $20&rdquo;. Hanya huruf pertama dan terakhir nama Anda, nama paket, dan waktu (dibulatkan ke menit) yang tampil. Email,
            harga, dan kode promo tidak pernah tampil. Matikan untuk tidak muncul sama sekali, perubahan berlaku dalam hitungan detik.
          </p>
        </div>
        <Switch id="show" name="show" defaultChecked={initialShow} aria-describedby="show-desc" className="mt-0.5" />
      </div>
      <div className="mt-5 flex items-center gap-4">
        <Button type="submit" disabled={pending} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan
        </Button>
        {state.ok && (
          <p role="status" className="text-sm text-success">
            {state.ok}
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
