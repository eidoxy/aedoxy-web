import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { db, pool as pgPool } from "@/server/db/client";
import { session } from "@/server/db/schema";
import { SESSION_TTL_SECONDS } from "@/server/session-config";
import { cookieAttr, seedPasswordUser, signIn } from "@/server/test/auth-helpers";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const HOUR = 3_600_000;

describe("session lifetime", () => {
  it("is configured as 24 hours without refresh", () => {
    expect(auth.options.session).toMatchObject({ expiresIn: 86_400, disableSessionRefresh: true });
    expect(SESSION_TTL_SECONDS).toBe(86_400);
  });

  it("sign-in gives a 24 hour row and a cookie with the same max-age", async () => {
    const u = await seedPasswordUser();
    const before = Date.now();
    const { sessionCookie } = await signIn(u.email);

    expect(cookieAttr(sessionCookie, "Max-Age")).toBe("86400");
    const [row] = await db.select().from(session).where(eq(session.userId, u.id));
    expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 24 * HOUR - 5_000);
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 24 * HOUR);
  });

  it("does not extend the session when it is used", async () => {
    const u = await seedPasswordUser();
    const { requestHeaders } = await signIn(u.email);
    // 2 hours left: with the default refresh this read would push it out again.
    const nearEnd = new Date(Date.now() + 2 * HOUR);
    await db.update(session).set({ expiresAt: nearEnd }).where(eq(session.userId, u.id));

    expect(await auth.api.getSession({ headers: requestHeaders })).not.toBeNull();

    const [row] = await db.select().from(session).where(eq(session.userId, u.id));
    expect(row.expiresAt.getTime()).toBe(nearEnd.getTime());
  });

  it("treats an expired session as signed out", async () => {
    const u = await seedPasswordUser();
    const { requestHeaders } = await signIn(u.email);
    await db.update(session).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(session.userId, u.id));

    expect(await auth.api.getSession({ headers: requestHeaders })).toBeNull();
  });
});
