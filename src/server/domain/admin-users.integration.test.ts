import { eq, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ mails: [] as { to: string; subject: string; text: string }[] }));
vi.mock("@/server/email", () => ({ sendEmail: async (m: { to: string; subject: string; text: string }) => void sent.mails.push(m) }));

import { auth } from "@/server/auth";
import { db, pool as pgPool } from "@/server/db/client";
import { account, adminAuditLog, oauthAccessToken, oauthClient, oauthConsent, oauthRefreshToken, orders, passkey, poolLedger, session, twoFactor, user, verification } from "@/server/db/schema";
import { seedPasswordUser, TEST_PASSWORD } from "@/server/test/auth-helpers";
import { installFakeServers, prepareDatabase, resetDatabase, seedPlan, seedUser } from "@/server/test/helpers";
import { adminDeleteUser, adminRenameUser, adminResetUserPasskeys, adminResetUserTwoFactor, adminSetUserPassword } from "./admin-user-manage";
import { syncConsoleStatuses } from "./console-status";
import { linkConsoleAccounts } from "./link-console-accounts";
import { adminBanUser, adminRevokeUserSessions, adminSetUserRole, adminUnbanUser, getAdminUser, listAdminUsers, parseUserQuery } from "./admin-users";
import { AdminError } from "./audit";

let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
  sent.mails.length = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const actor = { id: "admin-actor", ip: "198.51.100.4" };
const read = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0];
const day = 86_400_000;

async function seedSession(userId: string, token: string, expiresAt = new Date(Date.now() + 3_600_000)) {
  await db.insert(session).values({ id: `s-${token}`, token, userId, expiresAt, createdAt: new Date(), updatedAt: new Date() });
}
async function linked(overrides: Partial<typeof user.$inferInsert> = {}) {
  const u = await seedUser(overrides);
  fake.consoleAccounts.set(u.id, { id: u.newapiUserId!, username: "x", enabled: true });
  return u;
}

describe("parseUserQuery", () => {
  it("keeps valid values and drops invalid ones", () => {
    expect(parseUserQuery({ q: "  ani  ", role: "admin", status: "banned", verified: "yes", console: "linked", page: "3" })).toEqual({
      filter: { q: "ani", role: "admin", status: "banned", verified: "yes", console: "linked" },
      page: 3,
    });
    expect(parseUserQuery({ role: "root", status: ["x"], verified: "maybe", page: "-4" })).toEqual({ filter: { q: undefined, role: undefined, status: undefined, verified: undefined, console: undefined }, page: 1 });
    expect(parseUserQuery({ q: "x".repeat(101), page: "abc" }).filter.q).toBeUndefined();
    expect(parseUserQuery({ page: ["2", "5"] }).page).toBe(2);
  });
});

describe("listAdminUsers", () => {
  it("searches username, email and name, and treats % _ \\ as literal text", async () => {
    await seedUser({ username: "budi_s", name: "Budi", email: "budi@example.com" });
    await seedUser({ username: "budix", name: "Other", email: "o1@example.com" });
    await seedUser({ username: "pct", name: "100% Legit", email: "o2@example.com" });
    await seedUser({ username: "bs", name: "Back\\slash", email: "o3@example.com" });

    const q = async (s: string) => (await listAdminUsers({ q: s }, 1, 25)).rows.map((r) => r.username).sort();
    expect(await q("budi_s")).toEqual(["budi_s"]); // "_" must not match any character ("budix" has none in that spot)
    expect(await q("BUDI@EXAMPLE")).toEqual(["budi_s"]);
    expect(await q("100%")).toEqual(["pct"]);
    expect(await q("%")).toEqual(["pct"]);
    expect(await q("\\")).toEqual(["bs"]);
    expect(await q("x' OR '1'='1")).toEqual([]);
  });

  it("filters by role, ban state, verified e-mail and console link", async () => {
    const admin = await seedUser({ role: "admin" });
    const plain = await seedUser({ role: null, emailVerified: false, newapiUserId: null });
    const expired = await seedUser({ banned: true, banExpires: new Date(Date.now() - day) });
    const banned = await seedUser({ banned: true, banExpires: new Date(Date.now() + day), consoleDisabled: true });
    const ids = async (f: Parameters<typeof listAdminUsers>[0]) => (await listAdminUsers(f, 1, 25)).rows.map((r) => r.id).sort();

    expect(await ids({ role: "admin" })).toEqual([admin.id]);
    expect(await ids({ role: "user" })).toEqual([plain.id, expired.id, banned.id].sort());
    expect(await ids({ status: "banned" })).toEqual([banned.id]);
    expect(await ids({ status: "active" })).toEqual([admin.id, plain.id, expired.id].sort());
    expect(await ids({ verified: "no" })).toEqual([plain.id]);
    expect(await ids({ console: "unlinked" })).toEqual([plain.id]);
    expect((await listAdminUsers({ role: "user", console: "linked", status: "banned" }, 1, 25)).rows).toMatchObject([{ id: banned.id, banned: true, console: "disabled" }]);
  });

  it("orders newest first, pages by 25 and caps the page size at 100", async () => {
    for (let i = 0; i < 30; i++) await seedUser({ createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)) });
    const p1 = await listAdminUsers({}, 1, 25);
    const p2 = await listAdminUsers({}, 2, 25);
    expect(p1.total).toBe(30);
    expect(p1.rows).toHaveLength(25);
    expect(p2.rows).toHaveLength(5);
    expect(p1.rows[0].createdAt.getTime()).toBeGreaterThan(p1.rows[24].createdAt.getTime());
    expect((await listAdminUsers({}, 1, 10_000)).rows).toHaveLength(30);
    for (let i = 0; i < 80; i++) await seedUser();
    expect((await listAdminUsers({}, 1, 10_000)).rows).toHaveLength(100);
  });
});

describe("getAdminUser", () => {
  it("returns the profile without any secret, with providers, live sessions and the five latest orders", async () => {
    const u = await seedUser({ username: "ani", banned: true, banReason: "spam", banExpires: new Date(Date.now() + day), role: "admin", twoFactorEnabled: true });
    const now = new Date();
    await db.insert(account).values([
      { id: "a1", accountId: u.id, providerId: "credential", userId: u.id, password: "HASH-SECRET", createdAt: now, updatedAt: now },
      { id: "a2", accountId: "g1", providerId: "google", userId: u.id, accessToken: "TOKEN-SECRET", refreshToken: "REFRESH-SECRET", idToken: "ID-SECRET", createdAt: now, updatedAt: now },
    ]);
    await seedSession(u.id, "live");
    await seedSession(u.id, "dead", new Date(Date.now() - 1000));
    const plan = await seedPlan();
    for (let i = 0; i < 6; i++) {
      await db.insert(orders).values({
        userId: u.id,
        tradeNo: `T-${i}`,
        planId: plan.id,
        planSnapshot: { name: `Paket ${i}` },
        amountIdr: 55_000,
        listPriceIdr: 55_000,
        discountIdr: 0,
        creditQuota: plan.creditQuota,
        status: "pending",
        expiresAt: new Date(Date.now() + day),
        createdAt: new Date(Date.UTC(2026, 0, 1, 0, i)),
      });
    }

    const d = (await getAdminUser(u.id))!;
    expect(d).toMatchObject({ id: u.id, username: "ani", role: "admin", twoFactorEnabled: true, providers: ["credential", "google"], activeSessions: 1, console: "linked" });
    expect(d.ban).toMatchObject({ active: true, reason: "spam" });
    expect(d.recentOrders.map((o) => o.tradeNo)).toEqual(["T-5", "T-4", "T-3", "T-2", "T-1"]);
    expect(d.recentOrders[0].planName).toBe("Paket 5");
    const json = JSON.stringify(d);
    for (const secret of ["HASH-SECRET", "TOKEN-SECRET", "REFRESH-SECRET", "ID-SECRET", "password", "accessToken", "secret"]) expect(json).not.toContain(secret);
    expect(Object.keys(d).sort()).toEqual(["activePlan", "activeSessions", "ban", "console", "createdAt", "deletedAt", "email", "emailVerified", "hasPassword", "id", "name", "passkeyCount", "pendingOrders", "providers", "recentOrders", "role", "socialProviders", "twoFactorEnabled", "username"]);
  });

  it("returns null for an unknown id", async () => {
    expect(await getAdminUser("nope")).toBeNull();
  });
});

describe("adminBanUser / adminUnbanUser", () => {
  it("bans with the admin as actor, revokes sessions, disables the console account", async () => {
    const u = await linked();
    await seedSession(u.id, "a");
    await seedSession(u.id, "b");
    const until = new Date(Date.now() + 7 * day);

    const r = await adminBanUser(actor, u.id, { reason: "  abuse  ", expiresAt: until });

    expect(r).toMatchObject({ id: u.id, changed: true, sessionsRevoked: 2, console: "disabled" });
    expect(await read(u.id)).toMatchObject({ banned: true, banReason: "abuse", consoleDisabled: true });
    expect((await read(u.id)).banExpires?.toISOString()).toBe(until.toISOString());
    expect(await db.select().from(session).where(eq(session.userId, u.id))).toHaveLength(0);
    expect(fake.consoleAccounts.get(u.id)!.enabled).toBe(false);
    const [row] = await db.select().from(adminAuditLog);
    expect(row).toMatchObject({ actorId: "admin-actor", action: "user.ban", ip: "198.51.100.4", target: `user:${u.id}`, after: { banned: true, banReason: "abuse", sessionsRevoked: 2 } });

    const back = await adminUnbanUser(actor, u.id);
    expect(back).toMatchObject({ changed: true, console: "enabled" });
    expect(await read(u.id)).toMatchObject({ banned: false, banReason: null, banExpires: null, consoleDisabled: false });
    expect((await db.select().from(adminAuditLog)).map((a) => [a.actorId, a.action])).toEqual([
      ["admin-actor", "user.ban"],
      ["admin-actor", "user.unban"],
    ]);
  });

  it("keeps the ban when the bridge fails (pending)", async () => {
    const u = await linked();
    fake.state.failStatus.add(u.id);
    expect(await adminBanUser(actor, u.id, { reason: "x" })).toMatchObject({ changed: true, console: "pending" });
    expect(await read(u.id)).toMatchObject({ banned: true, consoleDisabled: false });
  });

  it("reports a console admin the console refuses to disable (409) as protected, ban kept", async () => {
    const u = await linked({ role: "admin" });
    fake.state.protectedSubjects.add(u.id);
    expect(await adminBanUser(actor, u.id, { reason: "x" })).toMatchObject({ changed: true, console: "protected" });
    expect(await read(u.id)).toMatchObject({ banned: true, consoleDisabled: false });
  });

  it("refuses bad input and self-ban without writing anything", async () => {
    const u = await seedUser();
    await expect(adminBanUser(actor, u.id, { reason: "   " })).rejects.toBeInstanceOf(AdminError);
    await expect(adminBanUser(actor, u.id, { reason: "x".repeat(201) })).rejects.toBeInstanceOf(AdminError);
    await expect(adminBanUser(actor, u.id, { reason: "x", expiresAt: new Date(Date.now() - 1000) })).rejects.toBeInstanceOf(AdminError);
    await expect(adminBanUser({ id: u.id, ip: null }, u.id, { reason: "x" })).rejects.toMatchObject({ code: "SELF_ACTION" });
    await expect(adminBanUser(actor, "missing", { reason: "x" })).rejects.toBeInstanceOf(AdminError);
    await expect(adminUnbanUser(actor, "missing")).rejects.toBeInstanceOf(AdminError);
    expect((await read(u.id)).banned).toBeFalsy();
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("allows banning another admin", async () => {
    const other = await seedUser({ role: "admin" });
    expect(await adminBanUser(actor, other.id, { reason: "x" })).toMatchObject({ changed: true });
  });
});

describe("adminSetUserRole", () => {
  it("promotes and demotes, audits before and after, and is a no-op when unchanged", async () => {
    const a = await seedUser({ role: "admin" });
    const u = await seedUser();
    expect(await adminSetUserRole(actor, u.id, "admin")).toEqual({ changed: true, role: "admin" });
    expect((await read(u.id)).role).toBe("admin");
    expect(await adminSetUserRole(actor, u.id, "admin")).toEqual({ changed: false, role: "admin" });
    expect(await adminSetUserRole(actor, a.id, "user")).toEqual({ changed: true, role: "user" });
    const audit = await db.select().from(adminAuditLog);
    expect(audit.map((x) => x.action)).toEqual(["user.role", "user.role"]);
    expect(audit[0]).toMatchObject({ actorId: "admin-actor", target: `user:${u.id}`, before: { role: "user" }, after: { role: "admin" } });
  });

  it("refuses: yourself, the last admin, an invalid role, an unknown user", async () => {
    const only = await seedUser({ role: "admin" });
    await expect(adminSetUserRole({ id: only.id, ip: null }, only.id, "user")).rejects.toMatchObject({ code: "SELF_ACTION" });
    await expect(adminSetUserRole(actor, only.id, "user")).rejects.toMatchObject({ code: "LAST_ADMIN" });
    await expect(adminSetUserRole(actor, only.id, "superuser")).rejects.toBeInstanceOf(AdminError);
    await expect(adminSetUserRole(actor, "missing", "admin")).rejects.toBeInstanceOf(AdminError);
    expect((await read(only.id)).role).toBe("admin");
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });
});

describe("adminRevokeUserSessions", () => {
  it("removes only that user's sessions and audits the count", async () => {
    const u = await seedUser();
    const other = await seedUser();
    await seedSession(u.id, "a");
    await seedSession(u.id, "b");
    await seedSession(other.id, "c");
    expect(await adminRevokeUserSessions(actor, u.id)).toEqual({ sessionsRevoked: 2 });
    expect(await db.select().from(session)).toHaveLength(1);
    expect((await db.select().from(adminAuditLog))[0]).toMatchObject({ action: "user.sessions_revoke", after: { sessionsRevoked: 2 } });
    await expect(adminRevokeUserSessions(actor, "missing")).rejects.toBeInstanceOf(AdminError);
  });
});

// ---- account management (display name, password, 2FA, passkeys, delete) ----

const NEW_PASSWORD = "brand-new-pass-99";
const flush = () => vi.waitFor(() => expect(sent.mails.length).toBeGreaterThan(0));

async function seedPasskey(userId: string, credentialID: string) {
  await db.insert(passkey).values({ id: `pk-${credentialID}`, publicKey: "pk", userId, credentialID, counter: 0, deviceType: "singleDevice", backedUp: false });
}
async function seedOrder(userId: string, status: "pending" | "paid", tradeNo: string) {
  const plan = await seedPlan();
  const [o] = await db
    .insert(orders)
    .values({ userId, tradeNo, planId: plan.id, planSnapshot: { name: "Paket" }, amountIdr: 55_000, listPriceIdr: 55_000, discountIdr: 0, creditQuota: plan.creditQuota, status, expiresAt: new Date(Date.now() + day) })
    .returning();
  return o;
}

describe("adminRenameUser", () => {
  it("trims, accepts 2 to 80 characters, audits without the name, and sends no email", async () => {
    const u = await seedUser();
    expect(await adminRenameUser(actor, u.id, "  Budi Santoso  ")).toEqual({ changed: true });
    expect((await read(u.id)).name).toBe("Budi Santoso");
    expect(await adminRenameUser(actor, u.id, "Budi Santoso")).toEqual({ changed: false });
    await adminRenameUser(actor, u.id, "ab");
    await adminRenameUser(actor, u.id, "x".repeat(80));
    await expect(adminRenameUser(actor, u.id, " a ")).rejects.toBeInstanceOf(AdminError);
    await expect(adminRenameUser(actor, u.id, "x".repeat(81))).rejects.toBeInstanceOf(AdminError);
    const audit = await db.select().from(adminAuditLog);
    expect(audit.map((a) => [a.action, a.after])).toEqual([["user.rename", { changed: true }], ["user.rename", { changed: true }], ["user.rename", { changed: true }]]);
    expect(JSON.stringify(audit)).not.toContain("Budi");
    expect(sent.mails).toHaveLength(0);
  });

  it("refuses yourself, an unknown user and a deleted user", async () => {
    const u = await seedUser();
    await expect(adminRenameUser({ id: u.id, ip: null }, u.id, "Nama Baru")).rejects.toMatchObject({ code: "SELF_ACTION" });
    await expect(adminRenameUser(actor, "missing", "Nama Baru")).rejects.toBeInstanceOf(AdminError);
    await db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, u.id));
    await expect(adminRenameUser(actor, u.id, "Nama Baru")).rejects.toMatchObject({ code: "USER_DELETED" });
  });
});

describe("adminSetUserPassword", () => {
  it("the new password signs in by username and by email, the old one no longer does, sessions are revoked, the email has no password", async () => {
    const u = await seedPasswordUser();
    await db.update(user).set({ username: "ani_x" }).where(eq(user.id, u.id));
    await seedSession(u.id, "old");

    expect(await adminSetUserPassword(actor, u.id, NEW_PASSWORD)).toEqual({ createdCredential: false, sessionsRevoked: 1 });

    expect(await db.select().from(session).where(eq(session.userId, u.id))).toHaveLength(0);
    const byEmail = await auth.api.signInEmail({ body: { email: u.email, password: NEW_PASSWORD }, headers: new Headers() });
    expect(byEmail.user.id).toBe(u.id);
    const byName = await auth.api.signInUsername({ body: { username: "ani_x", password: NEW_PASSWORD }, headers: new Headers() });
    expect(byName?.user.id).toBe(u.id);
    await expect(auth.api.signInEmail({ body: { email: u.email, password: TEST_PASSWORD }, headers: new Headers() })).rejects.toThrow();

    const audit = await db.select().from(adminAuditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: "admin-actor", action: "user.password.set", target: `user:${u.id}`, after: { createdCredential: false, sessionsRevoked: 1 } });
    await flush();
    expect(sent.mails).toHaveLength(1);
    expect(sent.mails[0]).toMatchObject({ to: u.email });
    expect(JSON.stringify([audit, sent.mails])).not.toContain(NEW_PASSWORD);
    expect(sent.mails[0].text).not.toMatch(/https?:/);
  });

  it("creates the email+password login for a social-only user", async () => {
    const u = await seedUser();
    const now = new Date();
    await db.insert(account).values({ id: "g1", accountId: "google-1", providerId: "google", userId: u.id, createdAt: now, updatedAt: now });

    expect(await adminSetUserPassword(actor, u.id, NEW_PASSWORD)).toMatchObject({ createdCredential: true });

    expect((await db.select().from(account).where(eq(account.userId, u.id))).map((a) => a.providerId).sort()).toEqual(["credential", "google"]);
    expect((await auth.api.signInEmail({ body: { email: u.email, password: NEW_PASSWORD }, headers: new Headers() })).user.id).toBe(u.id);
    expect((await db.select().from(adminAuditLog))[0].after).toMatchObject({ createdCredential: true });
  });

  it("enforces 10 to 128 characters and refuses yourself and a deleted user, writing nothing", async () => {
    const u = await seedPasswordUser();
    await expect(adminSetUserPassword(actor, u.id, "short")).rejects.toBeInstanceOf(AdminError);
    await expect(adminSetUserPassword(actor, u.id, "x".repeat(129))).rejects.toBeInstanceOf(AdminError);
    await expect(adminSetUserPassword({ id: u.id, ip: null }, u.id, NEW_PASSWORD)).rejects.toMatchObject({ code: "SELF_ACTION" });
    await expect(adminSetUserPassword(actor, "missing", NEW_PASSWORD)).rejects.toBeInstanceOf(AdminError);
    await db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, u.id));
    await expect(adminSetUserPassword(actor, u.id, NEW_PASSWORD)).rejects.toMatchObject({ code: "USER_DELETED" });
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
    expect(sent.mails).toHaveLength(0);
  });
});

describe("adminResetUserTwoFactor / adminResetUserPasskeys", () => {
  it("2FA reset: secret gone, sessions revoked, audit with the admin as actor, email sent", async () => {
    const u = await seedUser({ twoFactorEnabled: true });
    await db.insert(twoFactor).values({ id: "tf1", userId: u.id, secret: "SECRET-NOT-LOGGED", backupCodes: "CODES-NOT-LOGGED" });
    await seedSession(u.id, "a");
    expect(await adminResetUserTwoFactor(actor, u.id)).toEqual({ sessionsRevoked: 1 });
    expect(await db.select().from(twoFactor).where(eq(twoFactor.userId, u.id))).toHaveLength(0);
    expect((await read(u.id)).twoFactorEnabled).toBe(false);
    expect(await db.select().from(session).where(eq(session.userId, u.id))).toHaveLength(0);
    const [row] = await db.select().from(adminAuditLog);
    expect(row).toMatchObject({ actorId: "admin-actor", action: "user.2fa.reset", target: `user:${u.id}`, ip: "198.51.100.4" });
    expect(JSON.stringify(row)).not.toMatch(/NOT-LOGGED/);
    await flush();
    expect(sent.mails[0]).toMatchObject({ to: u.email });
  });

  it("2FA reset is refused without 2FA, for yourself and for a deleted user", async () => {
    const u = await seedUser({ twoFactorEnabled: false });
    await expect(adminResetUserTwoFactor(actor, u.id)).rejects.toMatchObject({ code: "NO_2FA" });
    await expect(adminResetUserTwoFactor({ id: u.id, ip: null }, u.id)).rejects.toMatchObject({ code: "SELF_ACTION" });
    await db.update(user).set({ deletedAt: new Date(), twoFactorEnabled: true }).where(eq(user.id, u.id));
    await expect(adminResetUserTwoFactor(actor, u.id)).rejects.toMatchObject({ code: "USER_DELETED" });
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("passkey reset removes only that user's passkeys, revokes sessions, audits the counts", async () => {
    const u = await seedUser();
    const other = await seedUser();
    await seedPasskey(u.id, "c1");
    await seedPasskey(u.id, "c2");
    await seedPasskey(other.id, "c3");
    await seedSession(u.id, "a");
    expect(await adminResetUserPasskeys(actor, u.id)).toEqual({ passkeysRemoved: 2, sessionsRevoked: 1 });
    expect(await db.select().from(passkey)).toHaveLength(1);
    expect((await db.select().from(adminAuditLog))[0]).toMatchObject({ actorId: "admin-actor", action: "user.passkeys.reset", after: { passkeysRemoved: 2, sessionsRevoked: 1 } });
    await flush();
    expect(sent.mails[0]).toMatchObject({ to: u.email });
  });

  it("passkey reset is refused when there is none, for yourself and for a deleted user", async () => {
    const u = await seedUser();
    await expect(adminResetUserPasskeys(actor, u.id)).rejects.toMatchObject({ code: "NO_PASSKEY" });
    await expect(adminResetUserPasskeys({ id: u.id, ip: null }, u.id)).rejects.toMatchObject({ code: "SELF_ACTION" });
    await db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, u.id));
    await expect(adminResetUserPasskeys(actor, u.id)).rejects.toMatchObject({ code: "USER_DELETED" });
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });
});

describe("adminDeleteUser (tombstone)", () => {
  async function seedFull() {
    const u = await seedPasswordUser();
    await db.update(user).set({ username: "gone_user", displayUsername: "Gone_User", image: "https://img.test/a.png", twoFactorEnabled: true }).where(eq(user.id, u.id));
    fake.consoleAccounts.set(u.id, { id: u.newapiUserId!, username: "gone_user", enabled: true });
    const now = new Date();
    await db.insert(account).values({ id: "soc", accountId: "gh-1", providerId: "github", userId: u.id, createdAt: now, updatedAt: now });
    await db.insert(twoFactor).values({ id: "tf", userId: u.id, secret: "s", backupCodes: "b" });
    await seedPasskey(u.id, "cred-1");
    await seedSession(u.id, "s1");
    await db.insert(oauthClient).values({ id: "c-1", clientId: "client-1", redirectUris: ["https://x.test/cb"] });
    await db.insert(oauthRefreshToken).values({ id: "rt", token: "rt-tok", clientId: "client-1", userId: u.id, expiresAt: new Date(Date.now() + day), createdAt: now, scopes: ["openid"] });
    await db.insert(oauthAccessToken).values({ id: "at", token: "at-tok", clientId: "client-1", userId: u.id, refreshId: "rt", expiresAt: new Date(Date.now() + day), createdAt: now, scopes: ["openid"] });
    await db.insert(oauthConsent).values({ id: "co", clientId: "client-1", userId: u.id, scopes: ["openid"], createdAt: now, updatedAt: now });
    await db.insert(verification).values({ id: "v1", identifier: u.email, value: "x", expiresAt: new Date(Date.now() + day), createdAt: now, updatedAt: now });
    await db.insert(verification).values({ id: "v2", identifier: "reset-password:tok", value: u.id, expiresAt: new Date(Date.now() + day), createdAt: now, updatedAt: now });
    await db.insert(verification).values({ id: "v3", identifier: "someone@else.test", value: "keep", expiresAt: new Date(Date.now() + day), createdAt: now, updatedAt: now });
    return u;
  }
  const confirm = "gone_user";

  it("wipes personal data and sign-in methods, keeps the row, the console link and the money records, and frees the email and username", async () => {
    const u = await seedFull();
    const paid = await seedOrder(u.id, "paid", "T-PAID");
    await db.insert(poolLedger).values({ type: "sell", delta: -5, orderId: paid.id, note: "keep me" });

    const r = await adminDeleteUser(actor, u.id, ` ${confirm} `);

    expect(r).toMatchObject({ console: "disabled", hadActivePlan: false, removed: { sessions: 1, accounts: 2, passkeys: 1, twoFactor: 1, oauthTokens: 2, oauthConsents: 1, verifications: 2 } });
    const row = await read(u.id);
    expect(row).toMatchObject({
      email: `deleted+${u.id}@deleted.invalid`,
      name: "Pengguna dihapus",
      image: null,
      username: null,
      displayUsername: null,
      twoFactorEnabled: false,
      banned: true,
      banReason: "Akun dihapus",
      banExpires: null,
      newapiUserId: u.newapiUserId,
    });
    expect(row.deletedAt).toBeInstanceOf(Date);
    for (const t of [session, account, passkey, twoFactor, oauthAccessToken, oauthRefreshToken, oauthConsent]) expect(await db.select().from(t)).toHaveLength(0);
    expect((await db.select().from(verification)).map((v) => v.id)).toEqual(["v3"]);
    expect((await db.select().from(orders).where(eq(orders.userId, u.id))).map((o) => o.tradeNo)).toEqual(["T-PAID"]);
    expect(await db.select().from(poolLedger)).toHaveLength(1);

    const [audit] = await db.select().from(adminAuditLog);
    expect(audit).toMatchObject({ actorId: "admin-actor", action: "user.delete", target: `user:${u.id}` });
    const dump = JSON.stringify(audit);
    for (const pii of [u.email, "gone_user", "Gone_User", "Tester"]) expect(dump).not.toContain(pii);
    expect(fake.consoleAccounts.get(u.id)!.enabled).toBe(false);
    expect(sent.mails).toHaveLength(0);

    // The same email and username can register again.
    const again = await auth.api.signUpEmail({ body: { email: u.email, password: NEW_PASSWORD, name: "Orang Baru", username: "gone_user" }, headers: new Headers() });
    expect(again.user.id).not.toBe(u.id);
    expect((await read(again.user.id)).username).toBe("gone_user");
  });

  it("is refused: yourself, an admin, a wrong confirmation, pending orders, an already deleted user; nothing changes", async () => {
    const u = await seedFull();
    await expect(adminDeleteUser({ id: u.id, ip: null }, u.id, confirm)).rejects.toMatchObject({ code: "SELF_ACTION" });
    await expect(adminDeleteUser(actor, u.id, "GONE_USER")).rejects.toMatchObject({ code: "CONFIRM_MISMATCH" });
    await expect(adminDeleteUser(actor, u.id, "")).rejects.toMatchObject({ code: "CONFIRM_MISMATCH" });
    const pending = await seedOrder(u.id, "pending", "T-PEND");
    await expect(adminDeleteUser(actor, u.id, confirm)).rejects.toMatchObject({ code: "PENDING_ORDERS" });
    await db.delete(orders).where(eq(orders.id, pending.id));
    await db.update(user).set({ role: "admin" }).where(eq(user.id, u.id));
    await expect(adminDeleteUser(actor, u.id, confirm)).rejects.toMatchObject({ code: "IS_ADMIN" });
    await db.update(user).set({ role: null }).where(eq(user.id, u.id));
    await expect(adminDeleteUser(actor, "missing", confirm)).rejects.toBeInstanceOf(AdminError);
    expect(await read(u.id)).toMatchObject({ username: "gone_user", deletedAt: null });
    expect(await db.select().from(session)).toHaveLength(1);
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);

    await adminDeleteUser(actor, u.id, confirm);
    await expect(adminDeleteUser(actor, u.id, confirm)).rejects.toMatchObject({ code: "USER_DELETED" });
  });

  it("asks the email as confirmation when there is no username", async () => {
    const u = await seedUser({ username: null });
    await expect(adminDeleteUser(actor, u.id, "x")).rejects.toMatchObject({ code: "CONFIRM_MISMATCH" });
    expect((await adminDeleteUser(actor, u.id, u.email)).console).toBe("disabled");
  });

  it("reports an unreachable bridge as pending and the worker disables the console account later; an unlinked user needs nothing", async () => {
    const u = await linked({ username: "pend_user" });
    fake.state.failStatus.add(u.id);
    expect((await adminDeleteUser(actor, u.id, "pend_user")).console).toBe("pending");
    expect(fake.consoleAccounts.get(u.id)!.enabled).toBe(true);
    fake.state.failStatus.clear();
    expect(await syncConsoleStatuses()).toMatchObject({ ok: 1, failed: 0 });
    expect(fake.consoleAccounts.get(u.id)!.enabled).toBe(false);
    expect((await read(u.id)).consoleDisabled).toBe(true);

    const none = await seedUser({ newapiUserId: null, username: "no_console" });
    expect((await adminDeleteUser(actor, none.id, "no_console")).console).toBe("none");
  });

  it("the link worker never creates a console account for a deleted user, and a console admin is reported protected", async () => {
    const v = await seedUser({ newapiUserId: null, username: "unlinked_del" });
    await adminDeleteUser(actor, v.id, "unlinked_del");
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, v.id));
    expect(await linkConsoleAccounts()).toMatchObject({ ok: 0, failed: 0 });
    expect(fake.state.ensureBodies).toHaveLength(0);
    expect((await read(v.id)).newapiUserId).toBeNull();

    const p = await linked({ username: "prot_user" });
    fake.state.protectedSubjects.add(p.id);
    expect((await adminDeleteUser(actor, p.id, "prot_user")).console).toBe("protected");
  });

  it("unban and the other actions refuse a deleted user", async () => {
    const u = await seedUser({ username: "dead_user" });
    await adminDeleteUser(actor, u.id, "dead_user");
    await expect(adminUnbanUser(actor, u.id)).rejects.toMatchObject({ code: "USER_DELETED" });
    await expect(adminBanUser(actor, u.id, { reason: "x" })).rejects.toMatchObject({ code: "USER_DELETED" });
    await expect(adminSetUserRole(actor, u.id, "admin")).rejects.toMatchObject({ code: "USER_DELETED" });
    await expect(adminRevokeUserSessions(actor, u.id)).rejects.toMatchObject({ code: "USER_DELETED" });
    expect(await read(u.id)).toMatchObject({ banned: true, role: null });
  });

  it("warns about an active plan through getAdminUser, and deleting is still allowed", async () => {
    const u = await seedUser({ username: "plan_user" });
    const o = await seedOrder(u.id, "paid", "T-ACTIVE");
    await db.execute(sql`insert into subscription_grants (order_id, newapi_user_id, newapi_user_subscription_id, credit_quota, ends_at) values (${o.id}, ${u.newapiUserId}, 1, 100, ${new Date(Date.now() + day).toISOString()})`);
    const d = (await getAdminUser(u.id))!;
    expect(d.activePlan).toMatchObject({ name: "Paket" });
    expect(await adminDeleteUser(actor, u.id, "plan_user")).toMatchObject({ hadActivePlan: true });
  });
});

describe("listAdminUsers and deleted accounts", () => {
  it("hides deleted users by default and shows only them with status=terhapus", async () => {
    const live = await seedUser({ username: "live_one" });
    const dead = await seedUser({ username: "dead_one" });
    await adminDeleteUser(actor, dead.id, "dead_one");
    const ids = async (f: Parameters<typeof listAdminUsers>[0]) => (await listAdminUsers(f, 1, 25)).rows.map((r) => r.id);
    expect(await ids({})).toEqual([live.id]);
    expect(await ids({ status: "banned" })).toEqual([]);
    expect(await ids({ status: "active" })).toEqual([live.id]);
    const gone = await listAdminUsers({ status: "terhapus" }, 1, 25);
    expect(gone.total).toBe(1);
    expect(gone.rows[0]).toMatchObject({ id: dead.id, deleted: true });
    expect(parseUserQuery({ status: "terhapus" }).filter.status).toBe("terhapus");
    expect((await getAdminUser(dead.id))!.deletedAt).toBeInstanceOf(Date);
  });
});
