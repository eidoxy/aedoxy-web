import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/server/auth", () => ({ auth: { api: { getSession: async () => current.session } } }));

import { proxy } from "./proxy";

const call = (path: string) => proxy(new NextRequest(`https://aedoxy.test${path}`));
beforeEach(() => {
  current.session = null;
});

describe("proxy /admin", () => {
  it("rewrites a non-admin to an unmatched path with no-store, so the styled 404 shows and no admin HTML is sent", async () => {
    current.session = { user: { id: "u1", role: "user" } };
    const res = await call("/admin/plans");
    expect(res.headers.get("x-middleware-rewrite")).toBe("https://aedoxy.test/_aedoxy/404");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("redirects an anonymous visitor to /login", async () => {
    const res = await call("/admin");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://aedoxy.test/login");
  });

  it("lets an admin with 2FA through", async () => {
    current.session = { user: { id: "a1", role: "admin", twoFactorEnabled: true } };
    const res = await call("/admin/plans");
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});