import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { account, adminAuditLog, orders, session, user } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, resetDatabase, seedPlan, seedUser } from "@/server/test/helpers";
import { adminBanUser, adminRevokeUserSessions, adminSetUserRole, adminUnbanUser, getAdminUser, listAdminUsers, parseUserQuery } from "./admin-users";
import { AdminError } from "./audit";

let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
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
    expect(Object.keys(d).sort()).toEqual(["activeSessions", "ban", "console", "createdAt", "email", "emailVerified", "id", "name", "providers", "recentOrders", "role", "twoFactorEnabled", "username"]);
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
