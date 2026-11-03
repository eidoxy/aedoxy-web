import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, session, user } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";
import { banUser, unbanUser } from "./ban-user";

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

async function seedSession(userId: string, token: string) {
  await db.insert(session).values({ id: `s-${token}`, token, userId, expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() });
}
async function linked(overrides: Partial<typeof user.$inferInsert> = {}) {
  const u = await seedUser(overrides);
  fake.consoleAccounts.set(u.id, { id: u.newapiUserId!, username: "x", enabled: true });
  return u;
}
const read = async (id: string) => (await db.select().from(user).where(eq(user.id, id)))[0];

describe("banUser / unbanUser", () => {
  it("bans, revokes only that user's sessions, audits, and disables the console account", async () => {
    const u = await linked({ email: "Bad@Example.com" });
    const other = await linked();
    await seedSession(u.id, "a");
    await seedSession(u.id, "b");
    await seedSession(other.id, "c");

    const result = await banUser(" bad@example.COM ", "  abuse  ");

    expect(result).toMatchObject({ id: u.id, changed: true, sessionsRevoked: 2, console: "disabled" });
    expect(await read(u.id)).toMatchObject({ banned: true, banReason: "abuse", banExpires: null, consoleDisabled: true });
    expect(await db.select().from(session).where(eq(session.userId, u.id))).toHaveLength(0);
    expect(await db.select().from(session).where(eq(session.userId, other.id))).toHaveLength(1);
    expect(fake.consoleAccounts.get(u.id)!.enabled).toBe(false);
    expect(fake.consoleAccounts.get(other.id)!.enabled).toBe(true);

    const audit = await db.select().from(adminAuditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: "cli:ban-user", action: "user.ban", target: `user:${u.id}`, after: { banned: true, banReason: "abuse", sessionsRevoked: 2 } });
  });

  it("keeps the ban when the bridge fails, and the worker task catches up", async () => {
    const u = await linked();
    fake.state.failStatus.add(u.id);
    expect(await banUser(u.email)).toMatchObject({ changed: true, console: "pending" });
    expect(await read(u.id)).toMatchObject({ banned: true, consoleDisabled: false });

    fake.state.failStatus.clear();
    const { syncConsoleStatuses } = await import("./console-status");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    await syncConsoleStatuses();
    expect(await read(u.id)).toMatchObject({ consoleDisabled: true });
    expect(fake.consoleAccounts.get(u.id)!.enabled).toBe(false);
  });

  it("unban reverses the ban and keeps sessions alone", async () => {
    const u = await linked();
    await banUser(u.email, "x");
    await seedSession(u.id, "later");

    const result = await unbanUser(u.email);

    expect(result).toMatchObject({ changed: true, sessionsRevoked: 0, console: "enabled" });
    expect(await read(u.id)).toMatchObject({ banned: false, banReason: null, banExpires: null, consoleDisabled: false });
    expect(fake.consoleAccounts.get(u.id)!.enabled).toBe(true);
    expect(await db.select().from(session).where(eq(session.userId, u.id))).toHaveLength(1);
    expect((await db.select().from(adminAuditLog)).map((a) => a.action)).toEqual(["user.ban", "user.unban"]);
  });

  it("reports a user without a console account", async () => {
    const u = await seedUser({ newapiUserId: null });
    expect(await banUser(u.email)).toMatchObject({ console: "none" });
    expect(fake.state.statusBodies).toHaveLength(0);
  });

  it("is idempotent", async () => {
    const u = await linked();
    await banUser(u.email);
    expect(await banUser(u.email)).toMatchObject({ changed: false, console: "disabled" });
    await unbanUser(u.email);
    expect(await unbanUser(u.email)).toMatchObject({ changed: false, console: "enabled" });
  });

  it("rejects an unknown email without writing anything, and an empty email", async () => {
    expect(await banUser("nobody@example.com")).toBeNull();
    expect(await unbanUser("nobody@example.com")).toBeNull();
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
    await expect(banUser("  ")).rejects.toThrow(RangeError);
  });
});
