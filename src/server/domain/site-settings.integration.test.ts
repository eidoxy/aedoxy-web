import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, siteAssets, siteSettings } from "@/server/db/schema";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { getAssetBody, getAssetHead, loadSiteSettings, resetSiteAsset, saveSiteAsset, saveSiteSection, siteDefaults } from "./site-settings";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const actor = { id: "admin-1", ip: "203.0.113.9" };
const info = { contentType: "image/png" as const, width: 128, height: 64 };

describe("loadSiteSettings", () => {
  it("returns the defaults with no stored row and no assets", async () => {
    expect(await loadSiteSettings()).toEqual({ ...siteDefaults(), updatedAt: null, assets: {} });
  });

  it("ignores a stored value that does not parse", async () => {
    await db.insert(siteSettings).values({ key: "site", value: { brandName: 42 } });
    expect((await loadSiteSettings()).brandName).toBe(siteDefaults().brandName);
  });
});

describe("saveSiteSection", () => {
  it("stores one section without touching the others and audits before/after of that section only", async () => {
    await saveSiteSection(actor, "brand", { brandName: "Acme", tagline: "Hi", description: "D" });
    const after = await saveSiteSection(actor, "contact", { companyName: "PT Acme", companyAddress: "", supportEmail: "a@b.co", whatsappUrl: "", telegramUrl: "" });
    expect(after).toMatchObject({ brandName: "Acme", companyName: "PT Acme" });
    expect(await loadSiteSettings()).toMatchObject({ brandName: "Acme", tagline: "Hi", supportEmail: "a@b.co" });

    const audit = await db.select().from(adminAuditLog).orderBy(adminAuditLog.id);
    expect(audit.map((a) => a.action)).toEqual(["site.brand", "site.contact"]);
    expect(audit[0]).toMatchObject({ actorId: "admin-1", target: "site_settings:site", ip: "203.0.113.9" });
    expect(audit[0].before).toMatchObject({ brandName: siteDefaults().brandName });
    expect(audit[0].after).toEqual({ brandName: "Acme", tagline: "Hi", description: "D" });
    expect(Object.keys(audit[1].after as object).sort()).toEqual(["companyAddress", "companyName", "supportEmail", "telegramUrl", "whatsappUrl"]);
  });

  it("refuses fields the section does not own", async () => {
    await expect(saveSiteSection(actor, "brand", { apiBaseUrl: "https://x.com" })).rejects.toThrow(/does not own/);
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("keeps other keys in site_settings alone", async () => {
    await db.insert(siteSettings).values({ key: "activity", value: { enabled: true } });
    await saveSiteSection(actor, "docs", { apiBaseUrl: "https://api.example.com", sampleModel: "m" });
    expect((await db.select().from(siteSettings).where(eq(siteSettings.key, "activity")))[0].value).toEqual({ enabled: true });
  });
});

describe("site assets", () => {
  const bytes = Buffer.from([1, 2, 3, 4, 5]);

  it("saves, replaces and resets an image; the audit row has hash and size but never the bytes", async () => {
    await saveSiteAsset(actor, "logo", bytes, info);
    const view = await loadSiteSettings();
    expect(view.assets.logo).toMatchObject({ width: 128, height: 64, contentType: "image/png", size: 5 });
    expect(view.assets.logo!.url).toMatch(/^\/brand\/logo\?v=[0-9a-f]{8}$/);
    expect((await getAssetBody("logo"))!.bytes.equals(bytes)).toBe(true);
    expect((await getAssetHead("logo"))!.sha256).toBe(view.assets.logo!.sha256);

    await saveSiteAsset(actor, "logo", Buffer.from([9, 9]), { ...info, width: 70 });
    expect(await db.select().from(siteAssets)).toHaveLength(1);
    expect(await resetSiteAsset(actor, "logo")).toBe(true);
    expect(await resetSiteAsset(actor, "logo")).toBe(false);
    expect(await getAssetHead("logo")).toBeNull();

    const audit = await db.select().from(adminAuditLog).orderBy(adminAuditLog.id);
    expect(audit.map((a) => a.action)).toEqual(["site.asset.set", "site.asset.set", "site.asset.reset"]);
    expect(audit[0]).toMatchObject({ target: "site_assets:logo", before: null, after: { contentType: "image/png", width: 128, height: 64, size: 5 } });
    expect(audit[1].before).toMatchObject({ size: 5 });
    expect(JSON.stringify(audit)).not.toMatch(/"bytes"|\[1,2,3|AQIDBAU/);
  });

  it("the table only takes the three kinds", async () => {
    await expect(db.insert(siteAssets).values({ kind: "banner", contentType: "image/png", bytes, width: 1, height: 1, sha256: "x" })).rejects.toThrow();
  });
});
