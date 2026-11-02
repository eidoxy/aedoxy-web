import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ session: null as unknown, tags: [] as string[] }));
vi.mock("@/server/session", () => ({ getSession: async () => current.session }));
// Only the TOTP check is faked: 123456 is the valid code. Everything else (guards, fresh-auth rules, database) is real.
vi.mock("@/server/auth", () => ({
  auth: {
    api: {
      verifyTOTP: async ({ body }: { body: { code: string } }) => {
        if (body.code !== "123456") throw new Error("invalid");
      },
      verifyBackupCode: async () => {
        throw new Error("invalid");
      },
    },
  },
}));
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

import { resetFreshCodeFailures } from "@/server/admin";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, siteAssets } from "@/server/db/schema";
import { loadSiteSettings } from "@/server/domain/site-settings";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { resetSiteAssetAction, saveAnnouncementAction, saveBrandAction, saveDocsAction, saveLogoOptionsAction, uploadSiteAssetAction } from "./actions";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  resetFreshCodeFailures();
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
  it("rejects a wrong or missing 2FA code and saves nothing", async () => {
    const fields = { brandName: "Acme", tagline: "", description: "" };
    expect(await saveBrandAction({}, form({ ...fields, totp: "000000" }))).toEqual({ error: "Kode 2FA salah." });
    expect(await saveBrandAction({}, form({ ...fields, totp: "" }))).toEqual({ error: "Masukkan kode 2FA atau gunakan passkey." });
    expect((await loadSiteSettings()).brandName).not.toBe("Acme");
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
    expect(current.tags).toEqual([]);
  });

  it("checks the input before spending a 2FA attempt", async () => {
    const r = await saveBrandAction({}, form({ brandName: "", tagline: "", description: "", totp: "000000" }));
    expect(r.fieldErrors?.brandName?.[0]).toMatch(/wajib/);
    const r2 = await saveDocsAction({}, form({ apiBaseUrl: "http://evil.example.com", sampleModel: "m", totp: "123456" }));
    expect(r2.fieldErrors?.apiBaseUrl).toBeDefined();
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("saves with a valid code, audits, and expires the site-settings tag", async () => {
    const r = await saveBrandAction({}, form({ brandName: "Acme", tagline: "Hello", description: "Desc", totp: "123456" }));
    expect(r).toEqual({ ok: "Brand disimpan." });
    expect(await loadSiteSettings()).toMatchObject({ brandName: "Acme", tagline: "Hello" });
    expect(current.tags).toContain("site-settings");
    const [row] = await db.select().from(adminAuditLog);
    expect(row).toMatchObject({ actorId: "admin-1", action: "site.brand", ip: "203.0.113.7", after: { brandName: "Acme", tagline: "Hello", description: "Desc" } });
  });

  it("announcement: the switch and the link rules", async () => {
    const base = { text: "Promo", href: "/pricing", linkLabel: "Lihat", totp: "123456" };
    const bad = await saveAnnouncementAction({}, form({ ...base, enabled: "on", href: "javascript:alert(1)" }));
    expect(bad.fieldErrors?.href).toBeDefined();
    expect(await saveAnnouncementAction({}, form({ ...base, enabled: "on" }))).toEqual({ ok: "Pengumuman disimpan." });
    expect((await loadSiteSettings()).announcement).toEqual({ enabled: true, text: "Promo", href: "/pricing", linkLabel: "Lihat" });
    await saveAnnouncementAction({}, form(base));
    expect((await loadSiteSettings()).announcement.enabled).toBe(false);
  });

  it("logo options", async () => {
    await saveLogoOptionsAction({}, form({ hideWordmark: "on", totp: "123456" }));
    expect((await loadSiteSettings()).hideWordmark).toBe(true);
  });
});

describe("image upload", () => {
  it("stores a valid PNG; the audit row has hash and size, never the bytes; the client file name is ignored", async () => {
    const r = await uploadSiteAssetAction({}, form({ kind: "logo", file: file(png(128, 64), "../../evil.php"), totp: "123456" }));
    expect(r.ok).toBe("Logo diperbarui.");
    const [asset] = await db.select().from(siteAssets);
    expect(asset).toMatchObject({ kind: "logo", contentType: "image/png", width: 128, height: 64 });
    const [row] = await db.select().from(adminAuditLog);
    expect(row).toMatchObject({ action: "site.asset.set", target: "site_assets:logo", after: { sha256: asset.sha256, size: png(128, 64).length } });
    expect(JSON.stringify(row)).not.toContain("evil");
    expect(JSON.stringify(row)).not.toContain("bytes");
  });

  it("refuses SVG even when it claims to be a PNG, and a wrong 2FA code does not store a valid image", async () => {
    expect(await uploadSiteAssetAction({}, form({ kind: "logo", file: file('<svg xmlns="http://www.w3.org/2000/svg"/>', "logo.png", "image/png"), totp: "123456" }))).toMatchObject({ error: expect.stringMatching(/Jenis file tidak diterima/) });
    expect(await uploadSiteAssetAction({}, form({ kind: "logo", file: file(png(128, 64)), totp: "000000" }))).toEqual({ error: "Kode 2FA salah." });
    expect(await db.select().from(siteAssets)).toHaveLength(0);
  });

  it("explains an empty, oversized or unknown upload", async () => {
    expect(await uploadSiteAssetAction({}, form({ kind: "logo", totp: "123456" }))).toEqual({ error: "Pilih file gambar lebih dulu." });
    expect(await uploadSiteAssetAction({}, form({ kind: "banner", file: file(png(128, 64)), totp: "123456" }))).toEqual({ error: "Jenis gambar tidak dikenal." });
    expect(await uploadSiteAssetAction({}, form({ kind: "favicon", file: file(new Uint8Array(257 * 1024)), totp: "123456" }))).toEqual({ error: "Favicon maksimal 256 KB." });
  });

  it("resets to the built-in image, with 2FA", async () => {
    await uploadSiteAssetAction({}, form({ kind: "og", file: file(png(1200, 630)), totp: "123456" }));
    expect(await resetSiteAssetAction({}, form({ kind: "og", totp: "000000" }))).toEqual({ error: "Kode 2FA salah." });
    expect(await resetSiteAssetAction({}, form({ kind: "og", totp: "123456" }))).toEqual({ ok: "Gambar OG dikembalikan ke bawaan." });
    expect(await db.select().from(siteAssets)).toHaveLength(0);
    expect((await db.select().from(adminAuditLog)).map((a) => a.action)).toEqual(["site.asset.set", "site.asset.reset"]);
  });
});

describe("guard", () => {
  it("a non-admin gets 404 and nothing is stored", async () => {
    current.session = { user: { id: "u1", role: "user", twoFactorEnabled: true }, session: { id: "s2" } };
    await expect(saveBrandAction({}, form({ brandName: "Hacked", tagline: "", description: "", totp: "123456" }))).rejects.toThrow("NOT_FOUND");
    await expect(uploadSiteAssetAction({}, form({ kind: "logo", file: file(png(128, 64)), totp: "123456" }))).rejects.toThrow("NOT_FOUND");
    expect(await db.select().from(siteAssets)).toHaveLength(0);
    expect((await loadSiteSettings()).brandName).not.toBe("Hacked");
  });
});
