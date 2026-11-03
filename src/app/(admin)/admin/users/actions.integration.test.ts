import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/server/session", () => ({ getSession: async () => current.session }));
// Configuration actions ask for no 2FA code (the verifier is never called); credential actions accept only GOOD_CODE.
const GOOD_CODE = "123456";
const verify = vi.hoisted(() => vi.fn(async ({ body }: { body: { code: string } }) => {
  if (body.code !== "123456") throw new Error("wrong code");
  return { status: true };
}));
const sent = vi.hoisted(() => ({ mails: [] as { to: string; subject: string; text: string }[] }));
vi.mock("@/server/email", () => ({ sendEmail: async (m: { to: string; subject: string; text: string }) => void sent.mails.push(m) }));
vi.mock("@/server/auth", () => ({ auth: { api: { verifyTOTP: verify, verifyBackupCode: verify } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, updateTag: () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { db, pool as pgPool } from "@/server/db/client";
import { account, adminAuditLog, passkey, session, twoFactor, user } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";
import { banUserAction, deleteUserAction, renameUserAction, resetUserPasskeysAction, resetUserTwoFactorAction, revokeSessionsAction, setUserPasswordAction, setUserRoleAction, unbanUserAction } from "./actions";

let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
  verify.mockClear();
  sent.mails.length = 0;
  current.session = { user: { id: "admin-1", role: "admin", twoFactorEnabled: true }, session: { id: "s1" } };
});
afterEach(() => vi.unstubAllGlobals());

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const read = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0];
const future = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);

describe("admin: works without a 2FA code and is audited", () => {
  it("ban with a reason and end date, then unban", async () => {
    const u = await seedUser();
    fake.consoleAccounts.set(u.id, { id: u.newapiUserId!, username: "x", enabled: true });
    await db.insert(session).values({ id: "s-a", token: "a", userId: u.id, expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() });

    const r = await banUserAction({}, form({ userId: u.id, reason: "spam", until: future }));
    expect(r.ok).toBe("Pengguna diblokir. 1 sesi dicabut. Console: dinonaktifkan.");
    expect(await read(u.id)).toMatchObject({ banned: true, banReason: "spam" });
    expect((await read(u.id)).banExpires!.getTime()).toBeGreaterThan(Date.now());

    expect((await unbanUserAction({}, form({ userId: u.id }))).ok).toBe("Blokir dibuka. Console: diaktifkan.");
    expect((await db.select().from(adminAuditLog)).map((a) => [a.actorId, a.action, a.ip])).toEqual([
      ["admin-1", "user.ban", "203.0.113.7"],
      ["admin-1", "user.unban", "203.0.113.7"],
    ]);
    expect(verify).not.toHaveBeenCalled();
  });

  it("role change and session revocation", async () => {
    const u = await seedUser();
    expect((await setUserRoleAction({}, form({ userId: u.id, role: "admin" }))).ok).toBe("Peran diubah menjadi admin.");
    expect((await read(u.id)).role).toBe("admin");
    expect((await revokeSessionsAction({}, form({ userId: u.id }))).ok).toBe("0 sesi dicabut.");
    expect((await db.select().from(adminAuditLog)).map((a) => a.action)).toEqual(["user.role", "user.sessions_revoke"]);
  });

  it("says why it refuses: self ban, self role, last admin", async () => {
    const other = await seedUser({ role: "admin" });
    expect(await banUserAction({}, form({ userId: "admin-1", reason: "x" }))).toEqual({ error: "Anda tidak bisa memblokir akun sendiri." });
    expect(await setUserRoleAction({}, form({ userId: "admin-1", role: "user" }))).toEqual({ error: "Anda tidak bisa mengubah peran akun sendiri." });
    expect(await setUserRoleAction({}, form({ userId: other.id, role: "user" }))).toEqual({ error: "Tidak bisa menurunkan admin terakhir." });
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("rejects invalid input before touching anything", async () => {
    const u = await seedUser();
    expect((await banUserAction({}, form({ userId: u.id, reason: "" }))).fieldErrors?.reason).toBeDefined();
    expect((await banUserAction({}, form({ userId: u.id, reason: "x".repeat(201) }))).fieldErrors?.reason).toBeDefined();
    expect((await banUserAction({}, form({ userId: u.id, reason: "x", until: "2026-13-45" }))).fieldErrors?.until).toBeDefined();
    expect((await banUserAction({}, form({ userId: u.id, reason: "x", until: "2020-01-01" }))).error).toBe("Tanggal berakhir harus di masa depan.");
    expect(await setUserRoleAction({}, form({ userId: u.id, role: "root" }))).toEqual({ error: "Data tidak valid." });
    expect(await unbanUserAction({}, form({ userId: "" }))).toEqual({ error: "Pengguna tidak valid." });
    expect((await read(u.id)).banned).toBeFalsy();
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });
});

describe("non-admin and anonymous callers are refused and nothing changes", () => {
  it.each([
    ["non-admin", { user: { id: "u1", role: "user", twoFactorEnabled: true }, session: { id: "s2" } }, "NOT_FOUND"],
    ["admin without 2FA", { user: { id: "a2", role: "admin", twoFactorEnabled: false }, session: { id: "s3" } }, "REDIRECT /admin/security"],
    ["anonymous", null, "REDIRECT /login"],
  ])("%s", async (_name, who, expected) => {
    const u = await seedUser();
    current.session = who;
    const fd = () => form({ userId: u.id, reason: "x", role: "admin", name: "Nama Baru", password: "long-enough-pass", totp: GOOD_CODE, confirm: "x" });
    for (const action of [banUserAction, unbanUserAction, setUserRoleAction, revokeSessionsAction, renameUserAction, setUserPasswordAction, resetUserTwoFactorAction, resetUserPasskeysAction, deleteUserAction]) await expect(action({}, fd())).rejects.toThrow(expected as string);
    expect(await read(u.id)).toMatchObject({ role: null, banned: false, deletedAt: null });
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
    expect(verify).not.toHaveBeenCalled();
    expect(sent.mails).toHaveLength(0);
  });
});

describe("account management actions", () => {
  const NEW_PASSWORD = "an-ok-new-password";

  it("rename: no code, bounds 2 to 80, audit without the name, nothing emailed", async () => {
    const u = await seedUser();
    expect((await renameUserAction({}, form({ userId: u.id, name: "  Siti Aminah " }))).ok).toBe("Nama diubah. Nama di console tidak ikut berubah.");
    expect((await read(u.id)).name).toBe("Siti Aminah");
    expect((await renameUserAction({}, form({ userId: u.id, name: "a" }))).fieldErrors?.name).toBeDefined();
    expect((await renameUserAction({}, form({ userId: u.id, name: "x".repeat(81) }))).fieldErrors?.name).toBeDefined();
    expect(JSON.stringify(await db.select().from(adminAuditLog))).not.toContain("Siti");
    expect(verify).not.toHaveBeenCalled();
    expect(sent.mails).toHaveLength(0);
  });

  it("credential actions refuse without proof or with a wrong code, and change nothing", async () => {
    const u = await seedUser({ twoFactorEnabled: true });
    await db.insert(twoFactor).values({ id: "tf", userId: u.id, secret: "s", backupCodes: "b" });
    await db.insert(passkey).values({ id: "pk", publicKey: "k", userId: u.id, credentialID: "c1", counter: 0, deviceType: "singleDevice", backedUp: false });
    for (const [action, extra] of [
      [setUserPasswordAction, { password: NEW_PASSWORD }],
      [resetUserTwoFactorAction, {}],
      [resetUserPasskeysAction, {}],
    ] as const) {
      expect(await action({}, form({ userId: u.id, totp: "", ...extra }))).toEqual({ error: "Masukkan kode 2FA atau gunakan passkey." });
      expect(await action({}, form({ userId: u.id, totp: "654321", ...extra }))).toEqual({ error: "Kode 2FA salah." });
    }
    expect(await db.select().from(account)).toHaveLength(0);
    expect(await db.select().from(twoFactor)).toHaveLength(1);
    expect(await db.select().from(passkey)).toHaveLength(1);
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
    expect(sent.mails).toHaveLength(0);
  });

  it("set password with a good code: audited, sessions revoked, the user is emailed and the email carries no password", async () => {
    const u = await seedUser();
    await db.insert(session).values({ id: "s-x", token: "x", userId: u.id, expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() });
    const r = await setUserPasswordAction({}, form({ userId: u.id, password: NEW_PASSWORD, totp: GOOD_CODE }));
    expect(r.ok).toContain("Kata sandi diatur (login dengan kata sandi dibuat untuk akun ini). 1 sesi dicabut.");
    expect(JSON.stringify(r)).not.toContain(NEW_PASSWORD);
    expect((await setUserPasswordAction({}, form({ userId: u.id, password: "short", totp: GOOD_CODE }))).fieldErrors?.password).toBeDefined();
    await vi.waitFor(() => expect(sent.mails).toHaveLength(1));
    expect(sent.mails[0].to).toBe(u.email);
    expect(JSON.stringify(sent.mails)).not.toContain(NEW_PASSWORD);
    expect(sent.mails[0].text).not.toMatch(/https?:/);
    expect((await db.select().from(adminAuditLog)).map((a) => [a.actorId, a.action, a.ip])).toEqual([["admin-1", "user.password.set", "203.0.113.7"]]);
    expect(JSON.stringify(await db.select().from(adminAuditLog))).not.toContain(NEW_PASSWORD);
  });

  it("reset 2FA and reset passkeys with a good code; both are refused when there is nothing to reset", async () => {
    const u = await seedUser({ twoFactorEnabled: true });
    expect(await resetUserPasskeysAction({}, form({ userId: u.id, totp: GOOD_CODE }))).toEqual({ error: "Pengguna ini tidak punya passkey." });
    await db.insert(twoFactor).values({ id: "tf", userId: u.id, secret: "s", backupCodes: "b" });
    await db.insert(passkey).values({ id: "pk", publicKey: "k", userId: u.id, credentialID: "c1", counter: 0, deviceType: "singleDevice", backedUp: false });

    expect((await resetUserTwoFactorAction({}, form({ userId: u.id, totp: GOOD_CODE }))).ok).toBe("2FA direset. 0 sesi dicabut. Pengguna diberi tahu lewat email.");
    expect((await read(u.id)).twoFactorEnabled).toBe(false);
    expect(await resetUserTwoFactorAction({}, form({ userId: u.id, totp: GOOD_CODE }))).toEqual({ error: "Pengguna ini tidak memakai 2FA." });
    expect((await resetUserPasskeysAction({}, form({ userId: u.id, totp: GOOD_CODE }))).ok).toBe("1 passkey dihapus. 0 sesi dicabut. Pengguna diberi tahu lewat email.");
    expect((await db.select().from(adminAuditLog)).map((a) => [a.actorId, a.action])).toEqual([
      ["admin-1", "user.2fa.reset"],
      ["admin-1", "user.passkeys.reset"],
    ]);
    await vi.waitFor(() => expect(sent.mails).toHaveLength(2));
  });

  it("delete needs the typed username, needs no code, and says the console is disabled, not removed", async () => {
    const u = await seedUser({ username: "bye_user" });
    fake.consoleAccounts.set(u.id, { id: u.newapiUserId!, username: "bye_user", enabled: true });
    expect(await deleteUserAction({}, form({ userId: u.id, confirm: "bye" }))).toEqual({ error: "Konfirmasi tidak cocok. Ketik ulang persis seperti yang tertera." });
    const r = await deleteUserAction({}, form({ userId: u.id, confirm: "bye_user" }));
    expect(r.ok).toBe("Akun dihapus. Akun console dinonaktifkan; catatan di console dapat dihapus manual oleh admin console.");
    expect(await read(u.id)).toMatchObject({ username: null, banned: true });
    expect(verify).not.toHaveBeenCalled();
    expect(sent.mails).toHaveLength(0);
    expect(await deleteUserAction({}, form({ userId: u.id, confirm: "bye_user" }))).toEqual({ error: "Akun ini sudah dihapus. Tidak ada aksi yang bisa dilakukan." });
  });

  it("an admin cannot target their own account with any of the new actions", async () => {
    const msg = "Anda tidak bisa mengelola akun sendiri di sini. Pakai halaman Keamanan.";
    const own = { userId: "admin-1", name: "Nama Baru", password: NEW_PASSWORD, totp: GOOD_CODE, confirm: "x" };
    for (const action of [renameUserAction, setUserPasswordAction, resetUserTwoFactorAction, resetUserPasskeysAction, deleteUserAction]) {
      expect(await action({}, form(own))).toEqual({ error: msg });
    }
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("limits each admin to 10 management actions a minute", async () => {
    const u = await seedUser();
    for (let i = 0; i < 10; i++) expect((await renameUserAction({}, form({ userId: u.id, name: `Nama ${i}` }))).ok).toBeDefined();
    expect(await renameUserAction({}, form({ userId: u.id, name: "Nama 11" }))).toEqual({ error: "Terlalu banyak aksi. Coba lagi dalam semenit." });
    expect(await deleteUserAction({}, form({ userId: u.id, confirm: "x" }))).toEqual({ error: "Terlalu banyak aksi. Coba lagi dalam semenit." });
    expect((await read(u.id)).name).toBe("Nama 9");
  });
});