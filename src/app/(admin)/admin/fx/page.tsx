import type { Metadata } from "next";
import { Suspense } from "react";
import { adminDate, Card, Stat } from "@/components/admin/common";
import { PageHeader } from "@/components/console/page-header";
import { FxSettingsForm, RefreshFxButton } from "@/components/admin/fx-forms";
import { Sparkline } from "@/components/admin/sparkline";
import { formatIdr } from "@/lib/format";
import { requireAdmin } from "@/server/admin";
import { getFxStatus } from "@/server/domain/fx-rate";

export const metadata: Metadata = { title: "Kurs" };

export default function FxPage() {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 rounded-[18px] border border-line bg-surface" />}>
      <Fx />
    </Suspense>
  );
}

async function Fx() {
  await requireAdmin();
  const s = await getFxStatus();
  const { settings, display } = s;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Kurs USD ke IDR"
        description="Kurs yang dipakai untuk perkiraan rupiah di halaman harga."
        actions={<RefreshFxButton />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Stat
          label="Kurs terpakai"
          value={display ? formatIdr(display.rate) : "-"}
          hint={display ? `${display.source} · ${display.sourceDate}${display.showConversion ? "" : " · konversi dimatikan"}` : "Belum ada kurs. Klik Perbarui sekarang atau isi kurs manual."}
        />
        {["ECB (Frankfurter)", "ExchangeRate-API"].map((name) => {
          const q = s.bySource.find((r) => r.source === name);
          return <Stat key={name} label={name} value={q ? formatIdr(q.rate) : "-"} hint={q ? `Data ${q.sourceDate} · diambil ${adminDate.format(q.fetchedAt)}` : "Belum pernah berhasil diambil"} />;
        })}
        <Stat
          label="Pembaruan berikut"
          value={settings.mode === "manual" ? "Manual" : s.nextRefreshAt ? adminDate.format(s.nextRefreshAt) : "Segera"}
          hint={settings.mode === "manual" ? "Mode manual memakai kurs yang diisi admin." : `Setiap ${settings.refreshHours} jam oleh worker`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <FxSettingsForm
          initial={{
            mode: settings.mode,
            manualRateIdr: settings.manualRateIdr ? String(Number(settings.manualRateIdr)) : "",
            refreshHours: settings.refreshHours,
            roundingStepIdr: settings.roundingStepIdr,
            showConversion: settings.showConversion,
          }}
        />
        <Card>
          <h2 className="text-lg font-medium text-heading">30 hari terakhir</h2>
          <p className="mt-1 mb-4 text-sm text-fg-muted">Kurs otomatis yang pernah dipakai, satu titik per tanggal data.</p>
          <Sparkline points={s.history} label="Grafik kurs USD ke IDR 30 hari terakhir" />
        </Card>
      </div>
    </div>
  );
}
