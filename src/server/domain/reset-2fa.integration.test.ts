import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, session, twoFactor, user } from "@/server/db/schema";
import { prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";
import { reset2fa } from "./reset-2fa";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

async function seedSession(userId: string, token: string) {
  await db.insert(session).values({ id: `s-${token}`, token, userId, expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() });
}

async function seedWith2fa(overrides: Partial<typeof user.$inferInsert> = {}) {
  const u = await seedUser({ role: "admin", twoFactorEnabled: true, ...overrides });
  await db.insert(twoFactor).values({ id: `tf-${u.id}`, userId: u.id, secret: "SECRET-NOT-LOGGED", backupCodes: "CODES-NOT-LOGGED" });
  return u;
}

describe("reset2fa", () => {
  it("removes the 2FA row, switches 2FA off, revokes every session of that user only, and audits", async () => {
    const u = await seedWith2fa({ email: "Boss@Example.com" });
    const other = await seedWith2fa();
    await seedSession(u.id, "a");
    await seedSession(u.id, "b");
    await seedSession(other.id, "c");

    const result = await reset2fa(" boss@example.COM ");

    expect(result).toMatchObject({ id: u.id, hadTwoFactor: true, sessionsRevoked: 2 });
    expect(await db.select().from(twoFactor).where(eq(twoFactor.userId, u.id))).toHaveLength(0);
    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row.twoFactorEnabled).toBe(false);
    expect(row.role).toBe("admin");
    expect(await db.select().from(session).where(eq(session.userId, u.id))).toHaveLength(0);
    // Someone else's 2FA and sessions are untouched.
    expect(await db.select().from(twoFactor).where(eq(twoFactor.userId, other.id))).toHaveLength(1);
    expect(await db.select().from(session).where(eq(session.userId, other.id))).toHaveLength(1);

    const audit = await db.select().from(adminAuditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: "cli:reset-2fa", action: "user.reset_2fa", target: `user:${u.id}`, after: { twoFactorEnabled: false, sessionsRevoked: 2 } });
    expect(JSON.stringify(audit[0])).not.toMatch(/NOT-LOGGED/);
  });

  it("rejects an unknown email and changes nobody", async () => {
    const u = await seedWith2fa();
    expect(await reset2fa("nobody@example.com")).toBeNull();
    expect(await db.select().from(twoFactor).where(eq(twoFactor.userId, u.id))).toHaveLength(1);
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("is idempotent when 2FA is already off", async () => {
    const u = await seedUser({ role: "admin", twoFactorEnabled: false });
    expect(await reset2fa(u.email)).toMatchObject({ hadTwoFactor: false, sessionsRevoked: 0 });
    expect(await reset2fa(u.email)).toMatchObject({ hadTwoFactor: false, sessionsRevoked: 0 });
    const [row] = await db.select().from(user).where(eq(user.id, u.id));
    expect(row.twoFactorEnabled).toBe(false);
  });

  it("rejects an empty email", async () => {
    await expect(reset2fa("  ")).rejects.toThrow(RangeError);
  });
});
