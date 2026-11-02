import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ load: null as null | (() => Promise<unknown>), life: [] as unknown[], tags: [] as string[] }));

vi.mock("next/cache", () => ({
  cacheLife: (p: unknown) => void state.life.push(p),
  cacheTag: (t: string) => void state.tags.push(t),
}));
vi.mock("@/server/domain/site-settings", async (orig) => ({
  ...(await orig<typeof import("@/server/domain/site-settings")>()),
  loadSiteSettings: () => state.load!(),
}));

import { siteDefaults } from "@/server/domain/site-settings";
import { getAnnouncement, getBrandName, getSiteSettings } from "./site";

const view = (over: Record<string, unknown> = {}) => ({ ...siteDefaults(), updatedAt: null, assets: {}, ...over });

beforeEach(() => {
  state.life = [];
  state.tags = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("getSiteSettings", () => {
  it("returns the stored view, tagged, with the normal cache window", async () => {
    state.load = async () => view({ brandName: "Acme" });
    expect((await getSiteSettings()).brandName).toBe("Acme");
    expect(state.tags).toEqual(["site-settings"]);
    expect(state.life).toEqual(["minutes"]);
  });

  it("returns the built-in values when the database is unreachable, cached only briefly (>= 5 min expire)", async () => {
    state.load = async () => {
      throw new Error("connect ECONNREFUSED");
    };
    const s = await getSiteSettings();
    expect(s).toMatchObject({ brandName: siteDefaults().brandName, assets: {}, updatedAt: null });
    expect(state.life).toEqual([{ stale: 30, revalidate: 30, expire: 300 }]);
  });
});

describe("getBrandName", () => {
  it("falls back to the default name", async () => {
    state.load = async () => {
      throw new Error("down");
    };
    expect(await getBrandName()).toBe(siteDefaults().brandName);
  });
});

describe("getAnnouncement", () => {
  const on = { enabled: true, text: "Promo", href: "/pricing", linkLabel: "Lihat" };

  it("is null while off or incomplete", async () => {
    state.load = async () => view();
    expect(await getAnnouncement()).toBeNull();
    state.load = async () => view({ announcement: { ...on, linkLabel: "" } });
    expect(await getAnnouncement()).toBeNull();
  });

  it("id changes with the text or the link, not with the label", async () => {
    state.load = async () => view({ announcement: on });
    const a = await getAnnouncement();
    expect(a).toMatchObject({ text: "Promo", href: "/pricing", linkLabel: "Lihat" });
    state.load = async () => view({ announcement: { ...on, text: "Promo baru" } });
    const b = await getAnnouncement();
    state.load = async () => view({ announcement: { ...on, href: "/models" } });
    const c = await getAnnouncement();
    state.load = async () => view({ announcement: { ...on, linkLabel: "Buka" } });
    const d = await getAnnouncement();
    expect(new Set([a!.id, b!.id, c!.id]).size).toBe(3);
    expect(d!.id).toBe(a!.id);
  });
});
