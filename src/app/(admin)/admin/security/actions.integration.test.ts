import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => current.headers, cookies: async () => ({ set() {}, get: () => undefined, getAll: () => [] }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { auth } from "@/server/auth";
import { resetFreshCodeFailures } from "@/server/admin";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, session, twoFactor, user } from "@/server/db/schema";
import { seedPasswordUser, signIn, TEST_PASSWORD } from "@/server/test/auth-helpers";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { regenerateBackupCodesAction, resetTwoFactorAction } from "./actions";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  resetFreshCodeFailures();
});

/** An admin with working 2FA, signed in. `codes` are the plain backup codes (the 2FA proof used in these tests). */
async function adminWith2fa() {
  const u = await seedPasswordUser();
  const { requestHeaders } = await signIn(u.email);
  current.headers = requestHeaders;
  const enabled = await auth.api.enableTwoFactor({ headers: requestHeaders, body: { password: TEST_PASSWORD } });
  if (enabled.method !== "totp") throw new Error("expected totp");
  await db.update(twoFactor).set({ verified: true }).where(eq(twoFactor.userId, u.id));
  await db.update(user).set({ role: "admin", twoFactorEnabled: true }).where(eq(user.id, u.id));
  return { u, codes: enabled.backupCodes };
}

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("regenerateBackupCodesAction", () => {
  it("needs the right password and a valid 2FA proof, then returns 10 new codes and kills the old ones", async () => {
    const { u, codes } = await adminWith2fa();

    expect(await regenerateBackupCodesAction({}, form({ password: "wrong-password-1", totp: codes[0] }))).toMatchObject({ error: "Kata sandi salah." });
    expect(await regenerateBackupCodesAction({}, form({ password: TEST_PASSWORD, totp: "" }))).toMatchObject({ error: "Masukkan kode 2FA atau gunakan passkey." });
    expect(await regenerateBackupCodesAction({}, form({ password: TEST_PASSWORD, totp: "AAAAA-00000" }))).toMatchObject({ error: "Kode 2FA salah." });

    const result = await regenerateBackupCodesAction({}, form({ password: TEST_PASSWORD, totp: codes[0] }));
    expect(result.codes).toHaveLength(10);
    expect(result.codes).not.toContain(codes[1]);

    // The previous set is dead, the new set works.
    expect(await regenerateBackupCodesAction({}, form({ password: TEST_PASSWORD, totp: codes[1] }))).toMatchObject({ error: "Kode 2FA salah." });
    expect((await regenerateBackupCodesAction({}, form({ password: TEST_PASSWORD, totp: result.codes![0] }))).codes).toHaveLength(10);

    const audit = await db.select().from(adminAuditLog);
    expect(audit.map((a) => a.action)).toEqual(["admin.2fa.backup_codes_regenerate", "admin.2fa.backup_codes_regenerate"]);
    expect(audit[0]).toMatchObject({ actorId: u.id, target: `user:${u.id}`, after: { count: 10 } });
    const dump = JSON.stringify(audit);
    for (const c of [...codes, ...result.codes!]) expect(dump).not.toContain(c);
  });
});

describe("resetTwoFactorAction", () => {
  it("switches 2FA off, signs out the other sessions, keeps a session for the caller and audits", async () => {
    const { u, codes } = await adminWith2fa();
    await signIn(u.email).catch(() => undefined); // 2FA is on now, so this does not create a session
    await db.insert(session).values({ id: "other", token: "other-token", userId: u.id, expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() });

    expect(await resetTwoFactorAction({}, form({ password: "wrong-password-1", totp: codes[0] }))).toMatchObject({ error: "Kata sandi salah." });
    expect((await db.select().from(user).where(eq(user.id, u.id)))[0].twoFactorEnabled).toBe(true);

    expect(await resetTwoFactorAction({}, form({ password: TEST_PASSWORD, totp: codes[0] }))).toMatchObject({ ok: expect.any(String) });

    expect((await db.select().from(user).where(eq(user.id, u.id)))[0].twoFactorEnabled).toBe(false);
    expect(await db.select().from(twoFactor).where(eq(twoFactor.userId, u.id))).toHaveLength(0);
    const sessions = await db.select().from(session).where(eq(session.userId, u.id));
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).not.toBe("other");
    const audit = await db.select().from(adminAuditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: u.id, action: "admin.2fa.reset" });
  });
});

describe("closed HTTP routes", () => {
  it.each(["/two-factor/disable", "/two-factor/generate-backup-codes", "/two-factor/get-totp-uri"])("%s answers 404 over HTTP", async (path) => {
    const res = await auth.handler(new Request(`https://aedoxy.test/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin: "https://aedoxy.test" }, body: "{}" }));
    expect(res.status).toBe(404);
  });
});
