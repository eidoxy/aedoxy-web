import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { db, pool as pgPool } from "@/server/db/client";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { classifyAdmin, decideAdminRequest, requireAdmin, verifyFreshAuth, verifyFreshCode } from "./admin";

// The attempt limit lives in Postgres (aedoxy_test), so this file needs the test database.
beforeAll(prepareDatabase);
afterAll(() => pgPool.end());

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

describe("verifyFreshAuth", () => {
  beforeEach(resetDatabase);
  const ok = async () => {};
  const bad = async () => {
    throw new Error("invalid");
  };

  it("with no code, spends the passkey proof once; without a proof it asks for a code or a passkey", async () => {
    let proofs = 1;
    const consumeProof = async () => proofs-- > 0;
    await expect(verifyFreshAuth({ totp: bad, backup: bad, consumeProof }, "u1", "  ")).resolves.toBeUndefined();
    await expect(verifyFreshAuth({ totp: bad, backup: bad, consumeProof }, "u1", "")).rejects.toMatchObject({ code: "TOTP_REQUIRED" });
  });

  it("a typed code never touches the proof, and a wrong code is not rescued by it", async () => {
    const consumeProof = vi.fn(async () => true);
    await verifyFreshAuth({ totp: ok, backup: ok, consumeProof }, "u1", "123456");
    await expect(verifyFreshAuth({ totp: bad, backup: bad, consumeProof }, "u1", "000000")).rejects.toMatchObject({ code: "TOTP_INVALID" });
    expect(consumeProof).not.toHaveBeenCalled();
  });

  it("keeps the 5-attempt limit for typed codes", async () => {
    const consumeProof = async () => false;
    for (let i = 0; i < 5; i++) await expect(verifyFreshAuth({ totp: bad, backup: bad, consumeProof }, "u1", "000000")).rejects.toMatchObject({ code: "TOTP_INVALID" });
    await expect(verifyFreshAuth({ totp: ok, backup: ok, consumeProof }, "u1", "123456")).rejects.toMatchObject({ code: "TOTP_RATE_LIMITED" });
  });
});

describe("verifyFreshCode", () => {
  beforeEach(resetDatabase);
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
    for (let i = 0; i < 5; i++) await expect(verifyFreshCode({ totp: bad, backup: bad }, "u1", "000000")).rejects.toMatchObject({ code: "TOTP_INVALID" });

    await expect(verifyFreshCode({ totp: ok, backup: ok }, "u1", "123456")).rejects.toMatchObject({ code: "TOTP_RATE_LIMITED" });
    await expect(verifyFreshCode({ totp: ok, backup: ok }, "u2", "123456")).resolves.toBeUndefined();
    // The window ends (database clock): move reset_at into the past instead of waiting 5 minutes.
    await db.execute(sql`update rate_limits set reset_at = now() - interval '1 second'`);
    await expect(verifyFreshCode({ totp: ok, backup: ok }, "u1", "123456")).resolves.toBeUndefined();
  });

  it("a right code forgets earlier wrong ones, so only consecutive failures add up", async () => {
    for (let i = 0; i < 4; i++) await expect(verifyFreshCode({ totp: bad, backup: bad }, "u1", "000000")).rejects.toMatchObject({ code: "TOTP_INVALID" });
    await verifyFreshCode({ totp: ok, backup: ok }, "u1", "123456");
    for (let i = 0; i < 5; i++) await expect(verifyFreshCode({ totp: bad, backup: bad }, "u1", "000000")).rejects.toMatchObject({ code: "TOTP_INVALID" });
  });

  it("parallel guesses cannot exceed the cap, and a database failure refuses the check without calling the verifier", async () => {
    const totp = vi.fn(bad);
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => verifyFreshCode({ totp, backup: bad }, "u1", "000000")));
    expect(totp).toHaveBeenCalledTimes(5);
    expect(results.filter((r) => r.status === "rejected" && (r.reason as { code: string }).code === "TOTP_RATE_LIMITED")).toHaveLength(7);

    const exec = vi.spyOn(db, "execute").mockRejectedValue(new Error("connection refused"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const verifier = vi.fn(ok);
    try {
      await expect(verifyFreshCode({ totp: verifier, backup: verifier }, "u9", "123456")).rejects.toMatchObject({ code: "TOTP_RATE_LIMITED" });
      expect(verifier).not.toHaveBeenCalled();
    } finally {
      exec.mockRestore();
      quiet.mockRestore();
    }
  });
});
