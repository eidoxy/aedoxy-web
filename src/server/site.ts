import { createHash } from "node:crypto";
import { cacheLife, cacheTag } from "next/cache";
import type { BrandInfo } from "@/lib/brand";
import { siteDefaults, loadSiteSettings, type SiteView } from "@/server/domain/site-settings";
import type { Announcement } from "@/server/catalog/types";

/**
 * Cached reader for the public site settings. /admin/settings expires the "site-settings" tag on every save.
 * Without a database (for example `docker build`) the built-in values are returned, and that answer is cached
 * only briefly so a recovered database is picked up quickly.
 */
export async function getSiteSettings(): Promise<SiteView> {
  "use cache";
  cacheTag("site-settings");
  try {
    const view = await loadSiteSettings();
    cacheLife("minutes");
    return view;
  } catch (err) {
    console.warn("[site] settings unavailable, using defaults", err instanceof Error ? err.message : "unknown");
    // expire must stay >= 5 min: shorter caches are excluded from prerender and fail the build (same as catalog/index.ts).
    cacheLife({ stale: 30, revalidate: 30, expire: 300 });
    return { ...siteDefaults(), updatedAt: null, assets: {} };
  }
}

export async function getBrand(): Promise<BrandInfo> {
  const { brandName, hideWordmark, assets } = await getSiteSettings();
  return { name: brandName, hideWordmark, logo: assets.logo ? { src: assets.logo.url, width: assets.logo.width, height: assets.logo.height } : null };
}

/** Brand name for code outside the render tree (emails). Never throws. */
export async function getBrandName(): Promise<string> {
  try {
    return (await getSiteSettings()).brandName;
  } catch {
    return siteDefaults().brandName;
  }
}

/** The id changes with the text or link, so a visitor who closed the old message sees the new one. */
export async function getAnnouncement(): Promise<Announcement | null> {
  const { announcement: a } = await getSiteSettings();
  if (!a.enabled || !a.text || !a.href || !a.linkLabel) return null;
  const id = createHash("sha256").update(`${a.text}\n${a.href}`).digest("hex").slice(0, 12);
  return { id, badge: "Info", text: a.text, href: a.href, linkLabel: a.linkLabel };
}

/** Current year for the footer. Cached: reading the clock directly would make the page dynamic. */
export async function getCopyrightYear(): Promise<number> {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}
