import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { site } from "@/config/site";
import { assetUrl, type AssetKind, type ImageInfo } from "@/lib/image-check";
import { mergeSiteSettings, SECTION_FIELDS, type SiteSection, type SiteSettings } from "@/lib/schemas/site";
import { db } from "@/server/db/client";
import { siteAssets, siteSettings } from "@/server/db/schema";
import { writeAudit, type Actor } from "./audit";

const KEY = "site";

export type AssetRef = { url: string; width: number; height: number; contentType: string; sha256: string; size: number; updatedAt: string };
export type SiteView = SiteSettings & {
  updatedAt: string | null;
  assets: Partial<Record<AssetKind, AssetRef>>;
};

/** Built-in values: config/site.ts and the environment. Used for every field the admin has not set. */
export function siteDefaults(): SiteSettings {
  return {
    brandName: site.name,
    tagline: site.tagline,
    description: site.description,
    hideWordmark: false,
    companyName: "",
    companyAddress: "",
    supportEmail: "",
    whatsappUrl: "",
    telegramUrl: "",
    announcement: { enabled: false, text: "", href: "", linkLabel: "" },
    apiBaseUrl: site.apiBaseUrl.replace(/\/+$/, ""),
    sampleModel: "your-model-id",
  };
}

type AssetMeta = Omit<typeof siteAssets.$inferSelect, "bytes"> & { size: number };

const assetMeta = {
  kind: siteAssets.kind,
  contentType: siteAssets.contentType,
  width: siteAssets.width,
  height: siteAssets.height,
  sha256: siteAssets.sha256,
  updatedAt: siteAssets.updatedAt,
  size: sql<number>`octet_length(${siteAssets.bytes})`.mapWith(Number),
};

const toRef = (m: AssetMeta): AssetRef => ({
  url: assetUrl(m.kind as AssetKind, m.sha256),
  width: m.width,
  height: m.height,
  contentType: m.contentType,
  sha256: m.sha256,
  size: m.size,
  updatedAt: m.updatedAt.toISOString(),
});

/** Stored settings over the defaults, plus the uploaded images. Throws when the database is unreachable: callers decide the fallback. */
export async function loadSiteSettings(): Promise<SiteView> {
  const [[row], metas] = await Promise.all([db.select().from(siteSettings).where(eq(siteSettings.key, KEY)), db.select(assetMeta).from(siteAssets)]);
  return {
    ...mergeSiteSettings(row?.value, siteDefaults()),
    updatedAt: row?.updatedAt.toISOString() ?? null,
    assets: Object.fromEntries(metas.map((m) => [m.kind, toRef(m)])),
  };
}

const pick = (s: SiteSettings, section: SiteSection) => Object.fromEntries(SECTION_FIELDS[section].map((k) => [k, s[k]]));

/**
 * Saves one section's fields (already validated by the caller) over whatever else is stored, with its audit row.
 * Read-modify-write under a row lock so two sections saved at once do not overwrite each other.
 */
export async function saveSiteSection(actor: Actor, section: SiteSection, patch: Partial<SiteSettings>) {
  const allowed = new Set<string>(SECTION_FIELDS[section]);
  const unknown = Object.keys(patch).filter((k) => !allowed.has(k));
  if (unknown.length > 0) throw new Error(`site section ${section} does not own: ${unknown.join(", ")}`);

  return db.transaction(async (tx) => {
    await tx.insert(siteSettings).values({ key: KEY, value: {} }).onConflictDoNothing();
    const [row] = await tx.select().from(siteSettings).where(eq(siteSettings.key, KEY)).for("update");
    const stored = (row.value && typeof row.value === "object" ? row.value : {}) as Record<string, unknown>;
    const defaults = siteDefaults();
    const before = mergeSiteSettings(stored, defaults);
    const next = { ...stored, ...patch };
    const after = mergeSiteSettings(next, defaults);
    await tx.update(siteSettings).set({ value: next, updatedAt: new Date() }).where(eq(siteSettings.key, KEY));
    await writeAudit(tx, { actor, action: `site.${section}`, target: `site_settings:${KEY}`, before: pick(before, section), after: pick(after, section) });
    return after;
  });
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Replaces the image of `kind`. The audit row carries hash and size, never the bytes. */
export async function saveSiteAsset(actor: Actor, kind: AssetKind, bytes: Buffer, info: ImageInfo) {
  const digest = sha256(bytes);
  return db.transaction(async (tx) => {
    const [before] = await tx.select(assetMeta).from(siteAssets).where(eq(siteAssets.kind, kind)).for("update");
    const values = { kind, contentType: info.contentType, bytes, width: info.width, height: info.height, sha256: digest, updatedAt: new Date() };
    await tx.insert(siteAssets).values(values).onConflictDoUpdate({ target: siteAssets.kind, set: values });
    const summary = (m: { contentType: string; width: number; height: number; sha256: string; size: number }) => ({ contentType: m.contentType, width: m.width, height: m.height, sha256: m.sha256, size: m.size });
    await writeAudit(tx, {
      actor,
      action: "site.asset.set",
      target: `site_assets:${kind}`,
      before: before ? summary(before) : null,
      after: summary({ ...info, sha256: digest, size: bytes.length }),
    });
  });
}

/** Back to the built-in image. A kind with no upload is not an error: nothing changes and nothing is audited. */
export async function resetSiteAsset(actor: Actor, kind: AssetKind) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select(assetMeta).from(siteAssets).where(eq(siteAssets.kind, kind)).for("update");
    if (!before) return false;
    await tx.delete(siteAssets).where(eq(siteAssets.kind, kind));
    await writeAudit(tx, {
      actor,
      action: "site.asset.reset",
      target: `site_assets:${kind}`,
      before: { contentType: before.contentType, width: before.width, height: before.height, sha256: before.sha256, size: before.size },
      after: null,
    });
    return true;
  });
}

/** For GET /brand/[kind]: cheap header lookup first, so a 304 never reads the bytes. */
export async function getAssetHead(kind: string) {
  const [row] = await db.select({ sha256: siteAssets.sha256, contentType: siteAssets.contentType }).from(siteAssets).where(eq(siteAssets.kind, kind));
  return row ?? null;
}

export async function getAssetBody(kind: string) {
  const [row] = await db.select({ sha256: siteAssets.sha256, contentType: siteAssets.contentType, bytes: siteAssets.bytes }).from(siteAssets).where(eq(siteAssets.kind, kind));
  return row ?? null;
}
