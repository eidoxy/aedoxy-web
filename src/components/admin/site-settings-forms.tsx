"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import {
  resetSiteAssetAction,
  saveAnnouncementAction,
  saveBrandAction,
  saveContactAction,
  saveDocsAction,
  saveLogoOptionsAction,
  saveSocialAction,
  uploadSiteAssetAction,
} from "@/app/(admin)/admin/settings/actions";
import { LogoMark } from "@/components/brand/logo";
import { SectionCard } from "@/components/console/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ASSET_KINDS, ASSET_LABEL, ASSET_RULES, type AssetKind } from "@/lib/image-check";
import type { SiteSettings } from "@/lib/schemas/site";
import { SOCIAL_LABEL, SOCIAL_PROVIDERS, type SocialProvider } from "@/lib/social";
import { buildSnippet } from "@/lib/snippets";
import type { AdminFormState } from "@/server/admin-action";
import { Field } from "./common";
import { FormResult } from "./totp-field";

type FormAction = (prev: AdminFormState, formData: FormData) => Promise<AdminFormState>;

function SaveButton({ pending, label = "Simpan" }: { pending: boolean; label?: string }) {
  return (
    <Button type="submit" disabled={pending} className="h-10 px-4 text-sm font-semibold">
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {label}
    </Button>
  );
}

/** One form per section: its own action and its own result line. */
function SectionForm({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action: FormAction;
  children: (fe: Record<string, string[] | undefined>) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState<AdminFormState, FormData>(action, {});
  return (
    <SectionCard title={title} description={description}>
      <form action={formAction} className="space-y-4">
        {children(state.fieldErrors ?? {})}
        <FormResult error={state.error} ok={state.ok} />
        <SaveButton pending={pending} />
      </form>
    </SectionCard>
  );
}

const inputClass = "h-9 bg-background";

export function BrandForm({ initial }: { initial: Pick<SiteSettings, "brandName" | "tagline" | "description"> }) {
  return (
    <SectionForm title="Brand" description="Nama dan teks yang tampil di header, judul tab, hasil pencarian, dan email." action={saveBrandAction}>
      {(fe) => (
        <>
          <Field label="Nama brand" htmlFor="brandName" hint="1 sampai 40 karakter." error={fe.brandName?.[0]}>
            <Input id="brandName" name="brandName" defaultValue={initial.brandName} maxLength={40} required className={inputClass} />
          </Field>
          <Field label="Tagline" htmlFor="tagline" hint="Maksimal 120 karakter." error={fe.tagline?.[0]}>
            <Input id="tagline" name="tagline" defaultValue={initial.tagline} maxLength={120} className={inputClass} />
          </Field>
          <Field label="Deskripsi" htmlFor="description" hint="Dipakai sebagai meta description. Maksimal 300 karakter." error={fe.description?.[0]}>
            <Textarea id="description" name="description" defaultValue={initial.description} maxLength={300} rows={3} />
          </Field>
        </>
      )}
    </SectionForm>
  );
}

export type AssetInfo = { url: string; width: number; height: number; contentType: string; size: number };

const kb = (n: number) => `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
const TYPE_LABEL: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP", "image/x-icon": "ICO" };

function Preview({ kind, asset, brandName }: { kind: AssetKind; asset?: AssetInfo; brandName: string }) {
  const pane = "flex h-20 items-center justify-center overflow-hidden rounded-lg border border-line p-3";
  const content = asset ? (
    // eslint-disable-next-line @next/next/no-img-element -- bytes come from our own route; SVG is refused at upload, so there is nothing to optimise
    <img src={asset.url} alt={`${ASSET_LABEL[kind]} ${brandName}`} width={asset.width} height={asset.height} className={kind === "og" ? "max-h-full w-auto" : kind === "favicon" ? "size-8" : "max-h-full w-auto max-w-full"} />
  ) : kind === "logo" ? (
    <LogoMark />
  ) : kind === "favicon" ? (
    // eslint-disable-next-line @next/next/no-img-element -- static built-in icon
    <img src="/icon.svg" alt="Favicon bawaan" width={32} height={32} className="size-8" />
  ) : (
    <span className="text-xs text-faint">Tanpa gambar OG</span>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className={`${pane} bg-white`}>{content}</div>
      <div className={`${pane} bg-neutral-900`}>{content}</div>
    </div>
  );
}

function AssetForm({ kind, asset, brandName }: { kind: AssetKind; asset?: AssetInfo; brandName: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>((prev, fd) => (fd.get("intent") === "reset" ? resetSiteAssetAction(prev, fd) : uploadSiteAssetAction(prev, fd)), {});
  const [clientError, setClientError] = useState<string>();
  const rules = ASSET_RULES[kind];
  const accept = rules.types.join(",") + (rules.types.includes("image/x-icon") ? ",.ico" : "");

  return (
    <form action={action} className="space-y-3 border-t border-line pt-4 first:border-t-0 first:pt-0">
      <input type="hidden" name="kind" value={kind} />
      <h3 className="text-sm font-medium text-heading">{ASSET_LABEL[kind]}</h3>
      <Preview kind={kind} asset={asset} brandName={brandName} />
      <p className="text-xs text-faint">
        {asset ? `${TYPE_LABEL[asset.contentType] ?? asset.contentType} · ${asset.width} x ${asset.height} px · ${kb(asset.size)}` : "Memakai gambar bawaan."} {rules.hint}
      </p>
      <Field label="Pilih file baru" htmlFor={`file-${kind}`} error={clientError}>
        <Input
          id={`file-${kind}`}
          name="file"
          type="file"
          accept={accept}
          className={inputClass}
          onChange={(e) => {
            const f = e.target.files?.[0];
            setClientError(f && f.size > rules.maxBytes ? `${ASSET_LABEL[kind]} maksimal ${rules.maxBytes / 1024} KB (file ini ${kb(f.size)}).` : undefined);
          }}
        />
      </Field>
      <FormResult error={state.error} ok={state.ok} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || Boolean(clientError)} className="h-10 px-4 text-sm font-semibold">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Unggah
        </Button>
        <Button type="submit" name="intent" value="reset" formNoValidate variant="outline" disabled={pending || !asset} className="h-10 px-4 text-sm font-semibold">
          Kembalikan ke bawaan
        </Button>
      </div>
    </form>
  );
}

export function LogoSection({ assets, hideWordmark, brandName }: { assets: Partial<Record<AssetKind, AssetInfo>>; hideWordmark: boolean; brandName: string }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(saveLogoOptionsAction, {});
  return (
    <SectionCard title="Logo dan ikon" description="Logo, favicon, dan gambar pratinjau tautan (OG). SVG tidak diterima. Pratinjau memakai latar terang dan gelap.">
      <div className="space-y-6">
        {ASSET_KINDS.map((k) => (
          <AssetForm key={k} kind={k} asset={assets[k]} brandName={brandName} />
        ))}
        <form action={action} className="space-y-4 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="hideWordmark" className="text-sm text-heading">
              Sembunyikan teks nama di samping logo
              <span className="block text-xs text-faint">Pakai bila gambar logo sudah memuat nama.</span>
            </label>
            <Switch id="hideWordmark" name="hideWordmark" defaultChecked={hideWordmark} />
          </div>
          <FormResult error={state.error} ok={state.ok} />
          <SaveButton pending={pending} />
        </form>
      </div>
    </SectionCard>
  );
}

export function ContactForm({ initial }: { initial: Pick<SiteSettings, "companyName" | "companyAddress" | "supportEmail" | "whatsappUrl" | "telegramUrl"> }) {
  return (
    <SectionForm
      title="Identitas dan kontak"
      description="Nama badan usaha, alamat, dan email mengisi tiga bagian di halaman Syarat, Privasi, dan Refund yang masih kosong."
      action={saveContactAction}
    >
      {(fe) => (
        <>
          <Field label="Badan usaha" htmlFor="companyName" hint="Juga tampil di hak cipta footer." error={fe.companyName?.[0]}>
            <Input id="companyName" name="companyName" defaultValue={initial.companyName} maxLength={120} className={inputClass} />
          </Field>
          <Field label="Alamat badan usaha" htmlFor="companyAddress" hint="Maksimal 300 karakter." error={fe.companyAddress?.[0]}>
            <Textarea id="companyAddress" name="companyAddress" defaultValue={initial.companyAddress} maxLength={300} rows={2} />
          </Field>
          <Field label="Email dukungan" htmlFor="supportEmail" error={fe.supportEmail?.[0]}>
            <Input id="supportEmail" name="supportEmail" type="email" defaultValue={initial.supportEmail} maxLength={120} className={inputClass} />
          </Field>
          <Field label="Tautan WhatsApp" htmlFor="whatsappUrl" hint="URL https, misalnya https://wa.me/628123456789. Kosongkan bila tidak ada." error={fe.whatsappUrl?.[0]}>
            <Input id="whatsappUrl" name="whatsappUrl" inputMode="url" defaultValue={initial.whatsappUrl} maxLength={300} className={inputClass} />
          </Field>
          <Field label="Tautan Telegram" htmlFor="telegramUrl" hint="URL https, misalnya https://t.me/namaakun." error={fe.telegramUrl?.[0]}>
            <Input id="telegramUrl" name="telegramUrl" inputMode="url" defaultValue={initial.telegramUrl} maxLength={300} className={inputClass} />
          </Field>
        </>
      )}
    </SectionForm>
  );
}

/**
 * Google and GitHub switches. `configured` is decided on the server from env; a provider without credentials cannot be switched.
 * The values travel in hidden inputs ("on"/"off"), because a disabled switch posts nothing and would be read as off.
 */
export function SocialForm({ initial, configured }: { initial: Pick<SiteSettings, "googleLoginEnabled" | "githubLoginEnabled">; configured: SocialProvider[] }) {
  const [on, setOn] = useState<Record<SocialProvider, boolean>>({ google: initial.googleLoginEnabled, github: initial.githubLoginEnabled });
  return (
    <SectionForm
      title="Login sosial"
      description="Tombol Masuk dan Daftar dengan Google atau GitHub. Server menolak penyedia yang dimatikan, bukan hanya menyembunyikan tombolnya."
      action={saveSocialAction}
    >
      {() => (
        <>
          {SOCIAL_PROVIDERS.map((p) => {
            const ready = configured.includes(p);
            return (
              <div key={p} className="flex items-center justify-between gap-4">
                <label htmlFor={`social-${p}`} className="text-sm text-heading">
                  {SOCIAL_LABEL[p]}
                  {!ready && <span className="block text-xs text-faint">Belum dikonfigurasi di server ({p.toUpperCase()}_*). Isi kredensialnya di env lalu deploy ulang.</span>}
                </label>
                <input type="hidden" name={`${p}LoginEnabled`} value={on[p] ? "on" : "off"} />
                <Switch id={`social-${p}`} checked={on[p]} disabled={!ready} onCheckedChange={(v) => setOn((prev) => ({ ...prev, [p]: v }))} />
              </div>
            );
          })}
          <p className="text-xs text-faint">
            Mematikan penyedia membuat pengguna yang hanya punya metode itu tidak bisa masuk sampai saklarnya dinyalakan lagi. Menautkan akun dari halaman Pengaturan pengguna juga ikut tertutup; melepas tautan tetap bisa.
          </p>
        </>
      )}
    </SectionForm>
  );
}

export function AnnouncementForm({ initial }: { initial: SiteSettings["announcement"] }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [text, setText] = useState(initial.text);
  const [href, setHref] = useState(initial.href);
  const [linkLabel, setLinkLabel] = useState(initial.linkLabel);
  const err = (fe: Record<string, string[] | undefined>, k: string) => fe[k]?.[0];

  return (
    <SectionForm title="Pengumuman" description="Bar di atas halaman publik. Pengunjung yang menutupnya melihatnya lagi bila teks atau tautan berubah." action={saveAnnouncementAction}>
      {(fe) => (
        <>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="enabled" className="text-sm text-heading">
              Tampilkan pengumuman
            </label>
            <Switch id="enabled" name="enabled" checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <Field label="Teks" htmlFor="text" hint={`${text.length}/140`} error={err(fe, "text")}>
            <Input id="text" name="text" value={text} onChange={(e) => setText(e.target.value)} maxLength={140} className={inputClass} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tautan" htmlFor="href" hint="Path internal (/pricing) atau URL https." error={err(fe, "href")}>
              <Input id="href" name="href" value={href} onChange={(e) => setHref(e.target.value)} maxLength={300} className={inputClass} />
            </Field>
            <Field label="Label tautan" htmlFor="linkLabel" hint={`${linkLabel.length}/24`} error={err(fe, "linkLabel")}>
              <Input id="linkLabel" name="linkLabel" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} maxLength={24} className={inputClass} />
            </Field>
          </div>
          <div>
            <p className="mono-label mb-1.5">Pratinjau {enabled ? "" : "(nonaktif)"}</p>
            <div className={`overflow-hidden rounded-lg border border-line ${enabled ? "" : "opacity-50"}`}>
              <div className="flex min-h-10 items-center justify-center gap-3 border-b border-primary-ink/15 bg-primary-tint px-4 py-2 text-sm text-fg">
                <span className="rounded bg-primary px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary-foreground uppercase">Info</span>
                <p className="min-w-0 break-words">
                  <span>{text || "Teks pengumuman"}</span>{" "}
                  <span className="inline-flex items-center gap-1 font-semibold whitespace-nowrap">
                    {linkLabel || "Label"}
                    <ArrowUpRight className="size-3.5" aria-hidden />
                  </span>
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </SectionForm>
  );
}

export function DocsForm({ initial }: { initial: Pick<SiteSettings, "apiBaseUrl" | "sampleModel"> }) {
  const [apiBaseUrl, setApiBaseUrl] = useState(initial.apiBaseUrl);
  const [sampleModel, setSampleModel] = useState(initial.sampleModel);
  return (
    <SectionForm title="Dokumentasi" description="Base URL API publik dan nama model yang dipakai pada contoh kode di situs." action={saveDocsAction}>
      {(fe) => (
        <>
          <Field label="Base URL API publik" htmlFor="apiBaseUrl" hint="https, tanpa /v1 di ujung. http hanya untuk localhost." error={fe.apiBaseUrl?.[0]}>
            <Input id="apiBaseUrl" name="apiBaseUrl" inputMode="url" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} maxLength={200} required className={inputClass} />
          </Field>
          <Field label="Contoh model" htmlFor="sampleModel" error={fe.sampleModel?.[0]}>
            <Input id="sampleModel" name="sampleModel" value={sampleModel} onChange={(e) => setSampleModel(e.target.value)} maxLength={80} required className={inputClass} />
          </Field>
          <div>
            <p className="mono-label mb-1.5">Contoh kode</p>
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs leading-5 text-fg">{buildSnippet("curl", apiBaseUrl.trim().replace(/\/+$/, ""), sampleModel.trim())}</pre>
          </div>
        </>
      )}
    </SectionForm>
  );
}
