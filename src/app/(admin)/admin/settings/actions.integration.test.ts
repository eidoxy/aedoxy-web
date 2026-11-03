import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ session: null as unknown, tags: [] as string[] }));
vi.mock("@/server/session", () => ({ getSession: async () => current.session }));
// Configuration changes ask for no 2FA code: any call to the verifiers fails the test. Guards and database are real.
const verify = vi.hoisted(() => vi.fn(async () => {
  throw new Error("2FA must not be requested for configuration changes");
}));
vi.mock("@/server/auth", () => ({ auth: { api: { verifyTOTP: verify, verifyBackupCode: verify } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, updateTag: (t: string) => void current.tags.push(t) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, siteAssets } from "@/server/db/schema";
import { loadSiteSettings } from "@/server/domain/site-settings";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { resetSiteAssetAction, saveAnnouncementAction, saveBrandAction, saveDocsAction, saveLogoOptionsAction, saveSocialAction, uploadSiteAssetAction } from "./actions";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  verify.mockClear();
  current.tags = [];
  current.session = { user: { id: "admin-1", role: "admin", twoFactorEnabled: true }, session: { id: "s1" } };
});

const form = (fields: Record<string, string | Blob>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...be32(0), 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
const file = (bytes: Uint8Array | string, name = "logo.png", type = "image/png") => new File([bytes as BlobPart], name, { type });

describe("text sections", () => {
  it("rejects invalid input and saves nothing", async () => {
    const r = await saveBrandAction({}, form({ brandName: "", tagline: "", description: "" }));
    expect(r.fieldErrors?.brandName?.[0]).toMatch(/wajib/);
    const r2 = await saveDocsAction({}, form({ apiBaseUrl: "http://evil.example.com", sampleModel: "m" }));
    expect(r2.fieldErrors?.apiBaseUrl).toBeDefined();
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
    expect(current.tags).toEqual([]);
  });

  it("saves without a 2FA code, audits, and expires the site-settings tag", async () => {
    const r = await saveBrandAction({}, form({ brandName: "Acme", tagline: "Hello", description: "Desc" }));
    expect(r).toEqual({ ok: "Brand disimpan." });
    expect(verify).not.toHaveBeenCalled();
    expect(await loadSiteSettings()).toMatchObject({ brandName: "Acme", tagline: "Hello" });
    expect(current.tags).toContain("site-settings");
    const [row] = await db.select().from(adminAuditLog);
    expect(row).toMatchObject({ actorId: "admin-1", action: "site.brand", ip: "203.0.113.7", after: { brandName: "Acme", tagline: "Hello", description: "Desc" } });
  });

  it("announcement: the switch and the link rules", async () => {
    const base = { text: "Promo", href: "/pricing", linkLabel: "Lihat" };
    const bad = await saveAnnouncementAction({}, form({ ...base, enabled: "on", href: "javascript:alert(1)" }));
    expect(bad.fieldErrors?.href).toBeDefined();
    expect(await saveAnnouncementAction({}, form({ ...base, enabled: "on" }))).toEqual({ ok: "Pengumuman disimpan." });
    expect((await loadSiteSettings()).announcement).toEqual({ enabled: true, text: "Promo", href: "/pricing", linkLabel: "Lihat" });
    await saveAnnouncementAction({}, form(base));
    expect((await loadSiteSettings()).announcement.enabled).toBe(false);
  });

  it("logo options", async () => {
    await saveLogoOptionsAction({}, form({ hideWordmark: "on" }));
    expect((await loadSiteSettings()).hideWordmark).toBe(true);
  });
});

describe("social login switches", () => {
  it("default to on, save without a code, audit under site.social and expire the tag", async () => {
    expect(await loadSiteSettings()).toMatchObject({ googleLoginEnabled: true, githubLoginEnabled: true });

    expect(await saveSocialAction({}, form({ googleLoginEnabled: "on", githubLoginEnabled: "off" }))).toEqual({ ok: "Login sosial disimpan." });

    expect(await loadSiteSettings()).toMatchObject({ googleLoginEnabled: true, githubLoginEnabled: false });
    expect(current.tags).toContain("site-settings");
    const [row] = await db.select().from(adminAuditLog);
    expect(row).toMatchObject({ actorId: "admin-1", action: "site.social", before: { googleLoginEnabled: true, githubLoginEnabled: true }, after: { googleLoginEnabled: true, githubLoginEnabled: false } });
  });
});
describe("image upload", () => {
  it("stores a valid PNG; the audit row has hash and size, never the bytes; the client file name is ignored", async () => {
    const r = await uploadSiteAssetAction({}, form({ kind: "logo", file: file(png(128, 64), "../../evil.php") }));
    expect(r.ok).toBe("Logo diperbarui.");
    const [asset] = await db.select().from(siteAssets);
    expect(asset).toMatchObject({ kind: "logo", contentType: "image/png", width: 128, height: 64 });
    const [row] = await db.select().from(adminAuditLog);
    expect(row).toMatchObject({ action: "site.asset.set", target: "site_assets:logo", after: { sha256: asset.sha256, size: png(128, 64).length } });
    expect(JSON.stringify(row)).not.toContain("evil");
    expect(JSON.stringify(row)).not.toContain("bytes");
  });

  it("refuses SVG even when it claims to be a PNG", async () => {
    expect(await uploadSiteAssetAction({}, form({ kind: "logo", file: file('<svg xmlns="http://www.w3.org/2000/svg"/>', "logo.png", "image/png") }))).toMatchObject({ error: expect.stringMatching(/Jenis file tidak diterima/) });
    expect(await db.select().from(siteAssets)).toHaveLength(0);
  });

  it("explains an empty, oversized or unknown upload", async () => {
    expect(await uploadSiteAssetAction({}, form({ kind: "logo" }))).toEqual({ error: "Pilih file gambar lebih dulu." });
    expect(await uploadSiteAssetAction({}, form({ kind: "banner", file: file(png(128, 64)) }))).toEqual({ error: "Jenis gambar tidak dikenal." });
    expect(await uploadSiteAssetAction({}, form({ kind: "favicon", file: file(new Uint8Array(257 * 1024)) }))).toEqual({ error: "Favicon maksimal 256 KB." });
  });

  it("resets to the built-in image", async () => {
    await uploadSiteAssetAction({}, form({ kind: "og", file: file(png(1200, 630)) }));
    expect(await resetSiteAssetAction({}, form({ kind: "og" }))).toEqual({ ok: "Gambar OG dikembalikan ke bawaan." });
    expect(await db.select().from(siteAssets)).toHaveLength(0);
    expect((await db.select().from(adminAuditLog)).map((a) => a.action)).toEqual(["site.asset.set", "site.asset.reset"]);
  });
});

describe("guard", () => {
  it("a non-admin gets 404 and nothing is stored", async () => {
    current.session = { user: { id: "u1", role: "user", twoFactorEnabled: true }, session: { id: "s2" } };
    await expect(saveBrandAction({}, form({ brandName: "Hacked", tagline: "", description: "" }))).rejects.toThrow("NOT_FOUND");
    await expect(uploadSiteAssetAction({}, form({ kind: "logo", file: file(png(128, 64)) }))).rejects.toThrow("NOT_FOUND");
    expect(await db.select().from(siteAssets)).toHaveLength(0);
    expect((await loadSiteSettings()).brandName).not.toBe("Hacked");
  });

  it("an anonymous caller is sent to /login and nothing is stored", async () => {
    current.session = null;
    await expect(saveBrandAction({}, form({ brandName: "Hacked", tagline: "", description: "" }))).rejects.toThrow("REDIRECT /login");
    expect((await loadSiteSettings()).brandName).not.toBe("Hacked");
  });
});
