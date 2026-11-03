import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/server/session", () => ({ getSession: async () => current.session }));
// Configuration actions ask for no 2FA code: any call to a verifier fails the test.
const verify = vi.hoisted(() => vi.fn(async () => {
  throw new Error("2FA must not be requested on the users page");
}));
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
import { adminAuditLog, session, user } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";
import { banUserAction, revokeSessionsAction, setUserRoleAction, unbanUserAction } from "./actions";

let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
  verify.mockClear();
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
    const fd = () => form({ userId: u.id, reason: "x", role: "admin" });
    for (const action of [banUserAction, unbanUserAction, setUserRoleAction, revokeSessionsAction]) await expect(action({}, fd())).rejects.toThrow(expected as string);
    expect(await read(u.id)).toMatchObject({ role: null, banned: false });
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });
});
