import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShellFallback } from "@/components/console/shell-fallback";
import { adminNav, adminNavFor } from "./admin-nav";
import { findActive, isItemActive, isSubActive, navHrefs, pageTitle, type NavGroup } from "./nav";
import { userNav } from "./user-nav";

const appDir = fileURLToPath(new URL("../app", import.meta.url));

/** Route patterns of every page.tsx: route groups dropped, [param] segments become wildcards. */
function pagePatterns(dir = appDir): RegExp[] {
  const out: RegExp[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pagePatterns(full));
    else if (entry.name === "page.tsx") {
      const segments = relative(appDir, dir)
        .split(sep)
        .filter((s) => s && !/^\(.*\)$/.test(s))
        .map((s) => (/^\[.+\]$/.test(s) ? "[^/]+" : s.replace(/[.*+?^${}()|\\]/g, "\\$&")));
      out.push(new RegExp(`^/${segments.join("/")}$`));
    }
  }
  return out;
}

const labels = (groups: NavGroup[]) =>
  groups.flatMap((g) => [g.label ?? "", ...g.items.flatMap((i) => [i.title, ...(i.subItems ?? []).map((s) => s.title)])]).filter(Boolean);

describe("menu config", () => {
  const patterns = pagePatterns();

  it.each([
    ["user", userNav],
    ["admin", adminNav],
  ])("every %s menu href has a page under src/app", (_name, groups) => {
    const hrefs = navHrefs(groups);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(patterns.some((p) => p.test(href)), `no page for ${href}`).toBe(true);
  });

  it("Pengaturan situs sits in the Sistem group and is hidden from an admin without 2FA", () => {
    const system = adminNav.find((g) => g.id === "system")!;
    expect(system.items.map((i) => i.url)).toContain("/admin/settings");
    expect(navHrefs(adminNavFor(false))).not.toContain("/admin/settings");
  });

  it("Pengguna sits in Sistem before Audit log and is hidden from an admin without 2FA", () => {
    const urls = adminNav.find((g) => g.id === "system")!.items.map((i) => i.url);
    expect(urls.indexOf("/admin/users")).toBeGreaterThan(-1);
    expect(urls.indexOf("/admin/users")).toBeLessThan(urls.indexOf("/admin/audit"));
    expect(navHrefs(adminNavFor(false))).not.toContain("/admin/users");
    expect(pageTitle(adminNav, "/admin/users/abc")).toBe("Pengguna");
  });

  it("admin menu without 2FA contains only Keamanan", () => {
    const groups = adminNavFor(false);
    expect(labels(groups)).toEqual(["Keamanan"]);
    expect(navHrefs(groups)).toEqual(["/admin/security"]);
    expect(navHrefs(adminNavFor(true))).toEqual(navHrefs(adminNav));
  });

  it.each([
    ["user", userNav],
    ["admin", adminNav],
  ])("no %s menu item repeats the label of its group", (_name, groups) => {
    for (const g of groups) for (const i of g.items) expect(i.title, `${i.title} repeats group ${g.label}`).not.toBe(g.label);
  });

  it("the billing item reads Paket & pesanan", () => {
    expect(userNav.flatMap((g) => g.items).some((i) => i.title === "Paket & pesanan")).toBe(true);
  });

  it("user menu keeps the Console API action out of the link list", () => {
    expect(navHrefs(userNav)).not.toContain(undefined);
    expect(userNav.flatMap((g) => g.items).some((i) => i.action === "open-console" && !i.url)).toBe(true);
  });
});

describe("active item and page title", () => {
  it("Ringkasan matches exactly, other items by path prefix", () => {
    expect(findActive(userNav, "/dashboard")?.item.title).toBe("Ringkasan");
    expect(findActive(userNav, "/dashboard/extra")).toBeNull();
    expect(findActive(userNav, "/orders/abc")?.sub?.title).toBe("Riwayat pesanan");
    expect(findActive(adminNav, "/admin")?.item.title).toBe("Ringkasan");
    expect(findActive(adminNav, "/admin/orders/7")?.item.title).toBe("Order");
  });

  it("matches on a segment boundary, not a string prefix", () => {
    expect(findActive(userNav, "/settingsx")).toBeNull();
    expect(findActive(adminNav, "/admin/plansfoo")).toBeNull();
  });

  it("the longest url wins, so Buat paket does not also light up Semua paket", () => {
    const plans = adminNav.flatMap((g) => g.items).find((i) => i.title === "Paket")!;
    const [all, create] = plans.subItems!;
    expect(isSubActive(adminNav, "/admin/plans/new", create)).toBe(true);
    expect(isSubActive(adminNav, "/admin/plans/new", all)).toBe(false);
    expect(isSubActive(adminNav, "/admin/plans/12", all)).toBe(true);
    expect(isItemActive(adminNav, "/admin/plans/new", plans)).toBe(true);
    expect(isItemActive(adminNav, "/admin/pool", plans)).toBe(false);
  });

  it("derives the title from the menu and falls back to empty", () => {
    expect(pageTitle(userNav, "/plans")).toBe("Pilih paket");
    expect(pageTitle(userNav, "/settings")).toBe("Pengaturan");
    expect(pageTitle(adminNav, "/admin/plans/new")).toBe("Buat paket");
    expect(pageTitle(adminNav, "/admin/audit")).toBe("Audit log");
    expect(pageTitle(adminNav, "/admin/settings")).toBe("Pengaturan situs");
    expect(pageTitle(userNav, "/nowhere")).toBe("");
  });
});

describe("ShellFallback", () => {
  const html = renderToStaticMarkup(createElement(ShellFallback));

  it("renders no text at all", () => {
    expect(html.replace(/<[^>]*>/g, "").trim()).toBe("");
  });

  it("contains no menu label of either role", () => {
    for (const label of [...labels(userNav), ...labels(adminNav), "Admin", "Console"]) expect(html).not.toContain(label);
  });
});
