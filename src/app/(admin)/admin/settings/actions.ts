"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { ASSET_KINDS, ASSET_LABEL, ASSET_RULES, ImageError, inspectImage, type AssetKind } from "@/lib/image-check";
import { announcementSchema, brandSchema, contactSchema, docsSchema, logoOptionsSchema, socialSchema, type SiteSection, type SiteSettings } from "@/lib/schemas/site";
import { getAdminActor, requireAdmin } from "@/server/admin";
import { formStrings, toActionError, type AdminFormState } from "@/server/admin-action";
import { resetSiteAsset, saveSiteAsset, saveSiteSection } from "@/server/domain/site-settings";

function refresh() {
  updateTag("site-settings"); // header, footer, metadata, legal pages and emails read this tag
  revalidatePath("/admin/settings");
}

type Fields = Record<string, string>;

/** Shared by every text section: guard, validate, save + audit, expire the cache. */
async function saveSection(section: SiteSection, schema: z.ZodType<Partial<SiteSettings>>, formData: FormData, toRaw: (f: Fields) => unknown, ok: string): Promise<AdminFormState> {
  const session = await requireAdmin();
  const fields = formStrings(formData);
  const parsed = schema.safeParse(toRaw(fields));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    await saveSiteSection(await getAdminActor(session), section, parsed.data);
  } catch (err) {
    return toActionError(err);
  }
  refresh();
  return { ok };
}

export async function saveBrandAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  return saveSection("brand", brandSchema, formData, (f) => f, "Brand disimpan.");
}

export async function saveLogoOptionsAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  return saveSection("logo", logoOptionsSchema, formData, () => ({ hideWordmark: formData.get("hideWordmark") === "on" }), "Pengaturan logo disimpan.");
}

export async function saveContactAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  return saveSection("contact", contactSchema, formData, (f) => f, "Identitas dan kontak disimpan.");
}

/** The form posts "on"/"off" in hidden inputs: a switch that is disabled (provider not configured) would otherwise be absent and read as off. */
export async function saveSocialAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  return saveSection(
    "social",
    socialSchema,
    formData,
    () => ({ googleLoginEnabled: formData.get("googleLoginEnabled") === "on", githubLoginEnabled: formData.get("githubLoginEnabled") === "on" }),
    "Login sosial disimpan.",
  );
}

export async function saveAnnouncementAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  return saveSection("announcement", announcementSchema.transform((announcement) => ({ announcement })), formData, (f) => ({ ...f, enabled: formData.get("enabled") === "on" }), "Pengumuman disimpan.");
}

export async function saveDocsAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  return saveSection("docs", docsSchema, formData, (f) => f, "Pengaturan dokumentasi disimpan.");
}

const kindOf = (v: FormDataEntryValue | null): AssetKind | null => ASSET_KINDS.find((k) => k === v) ?? null;

/** The file name and the client's Content-Type are ignored: only the bytes decide (see lib/image-check.ts). */
export async function uploadSiteAssetAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const kind = kindOf(formData.get("kind"));
  if (!kind) return { error: "Jenis gambar tidak dikenal." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Pilih file gambar lebih dulu." };
  const { maxBytes } = ASSET_RULES[kind];
  if (file.size > maxBytes) return { error: `${ASSET_LABEL[kind]} maksimal ${maxBytes / 1024} KB.` };

  let info: ReturnType<typeof inspectImage>;
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    info = inspectImage(bytes, kind);
  } catch (err) {
    if (err instanceof ImageError) return { error: err.message };
    throw err;
  }
  try {
    await saveSiteAsset(await getAdminActor(session), kind, bytes, info);
  } catch (err) {
    return toActionError(err);
  }
  refresh();
  return { ok: `${ASSET_LABEL[kind]} diperbarui.${info.warning ? ` ${info.warning}` : ""}` };
}

export async function resetSiteAssetAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const kind = kindOf(formData.get("kind"));
  if (!kind) return { error: "Jenis gambar tidak dikenal." };
  try {
    const changed = await resetSiteAsset(await getAdminActor(session), kind);
    if (!changed) return { ok: `${ASSET_LABEL[kind]} sudah memakai gambar bawaan.` };
  } catch (err) {
    return toActionError(err);
  }
  refresh();
  return { ok: `${ASSET_LABEL[kind]} dikembalikan ke bawaan.` };
}
