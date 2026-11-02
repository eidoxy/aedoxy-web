import { beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/server/session", () => ({ getSession: async () => current.session }));
vi.mock("@/server/auth", () => ({ auth: { api: {} } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { classifyAdmin, decideAdminRequest, requireAdmin, resetFreshCodeFailures, verifyFreshCode } from "./admin";

const session = (user: Record<string, unknown>) => ({ user: { id: "u1", ...user } });
const fullAdmin = session({ role: "admin", twoFactorEnabled: true });

describe("admin guard", () => {
  it("classifies anonymous, non-admin, admin without 2FA and full admin", () => {
    expect(classifyAdmin(null).kind).toBe("anonymous");
    expect(classifyAdmin(session({ role: "user", twoFactorEnabled: true })).kind).toBe("forbidden");
    expect(classifyAdmin(session({ role: null })).kind).toBe("forbidden");
    expect(classifyAdmin(session({ role: "admin", twoFactorEnabled: false })).kind).toBe("needs_2fa");
    expect(classifyAdmin(session({ role: "admin" })).kind).toBe("needs_2fa");
    expect(classifyAdmin(fullAdmin).kind).toBe("ok");
  });

  it("answers a non-admin with 404, even when they have 2FA", async () => {
    current.session = session({ role: "user", twoFactorEnabled: true });
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
  });

  it("sends a signed-out visitor to the login page", async () => {
    current.session = null;
    await expect(requireAdmin()).rejects.toThrow("REDIRECT /login");
  });

  it("sends an admin without 2FA to /admin/security, and lets that page itself through", async () => {
    current.session = session({ role: "admin", twoFactorEnabled: false });
    await expect(requireAdmin()).rejects.toThrow("REDIRECT /admin/security");
    await expect(requireAdmin({ allowWithout2fa: true })).resolves.toMatchObject({ user: { id: "u1" } });
  });

  it("lets a full admin through", async () => {
    current.session = fullAdmin;
    await expect(requireAdmin()).resolves.toMatchObject({ user: { role: "admin" } });
  });
});

describe("decideAdminRequest (proxy)", () => {
  const no2fa = session({ role: "admin", twoFactorEnabled: false });

  it("sends a signed-out visitor to /login", () => {
    expect(decideAdminRequest(null, "/admin")).toEqual({ kind: "redirect", to: "/login" });
  });

  it("answers a non-admin with 404 on every admin path, with or without 2FA", () => {
    for (const s of [session({ role: "user", twoFactorEnabled: true }), session({ role: null })]) {
      for (const path of ["/admin", "/admin/pool", "/admin/pool/export", "/admin/security"]) {
        expect(decideAdminRequest(s, path)).toEqual({ kind: "not_found" });
      }
    }
  });

  it("sends an admin without 2FA to /admin/security from any other page, and lets that page through", () => {
    expect(decideAdminRequest(no2fa, "/admin")).toEqual({ kind: "redirect", to: "/admin/security" });
    expect(decideAdminRequest(no2fa, "/admin/pool/export")).toEqual({ kind: "redirect", to: "/admin/security" });
    expect(decideAdminRequest(no2fa, "/admin/securityx")).toEqual({ kind: "redirect", to: "/admin/security" });
    expect(decideAdminRequest(no2fa, "/admin/security")).toEqual({ kind: "next" });
  });

  it("lets a full admin through", () => {
    expect(decideAdminRequest(fullAdmin, "/admin")).toEqual({ kind: "next" });
    expect(decideAdminRequest(fullAdmin, "/admin/security")).toEqual({ kind: "next" });
  });
});

describe("verifyFreshCode", () => {
  beforeEach(resetFreshCodeFailures);
  const ok = async () => {};
  const bad = async () => {
    throw new Error("invalid");
  };

  it("sends 6 digits to the TOTP verifier and anything else to the backup-code verifier", async () => {
    const totp = vi.fn(ok);
    const backup = vi.fn(ok);
    await verifyFreshCode({ totp, backup }, "u1", " 123 456 ");
    await verifyFreshCode({ totp, backup }, "u1", "abcde-12345");
    expect(totp).toHaveBeenCalledWith("123456");
    expect(backup).toHaveBeenCalledWith("abcde-12345");
  });

  it("rejects a wrong code and an empty one", async () => {
    await expect(verifyFreshCode({ totp: bad, backup: bad }, "u1", "000000")).rejects.toMatchObject({ code: "TOTP_INVALID" });
    await expect(verifyFreshCode({ totp: ok, backup: ok }, "u1", "  ")).rejects.toMatchObject({ code: "TOTP_REQUIRED" });
  });

  it("locks a user out after 5 wrong codes in 5 minutes, even for a right code, then recovers", async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 5; i++) await expect(verifyFreshCode({ totp: bad, backup: bad }, "u1", "000000", t0 + i)).rejects.toMatchObject({ code: "TOTP_INVALID" });

    await expect(verifyFreshCode({ totp: ok, backup: ok }, "u1", "123456", t0 + 10)).rejects.toMatchObject({ code: "TOTP_RATE_LIMITED" });
    await expect(verifyFreshCode({ totp: ok, backup: ok }, "u2", "123456", t0 + 10)).resolves.toBeUndefined();
    await expect(verifyFreshCode({ totp: ok, backup: ok }, "u1", "123456", t0 + 5 * 60_000 + 10)).resolves.toBeUndefined();
  });
});
