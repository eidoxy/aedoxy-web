import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { db, pool as pgPool } from "@/server/db/client";
import { session } from "@/server/db/schema";
import { cookieAttr, seedPasswordUser, signIn, TEST_PASSWORD } from "@/server/test/auth-helpers";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { hasPasswordLogin, nextTrustState, TRUSTED_TTL_SECONDS } from "./session-trust";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const rowOf = async (token: string) => (await db.select().from(session).where(eq(session.token, token)))[0];
const tokenOf = (cookieLine: string) => decodeURIComponent(cookieLine.split(";")[0].split("=")[1]).split(".")[0];

async function setTrust(requestHeaders: Headers, body: { trusted: boolean; password?: string }) {
  return auth.api.setSessionTrust({ headers: requestHeaders, body, returnHeaders: true });
}

describe("nextTrustState", () => {
  const now = new Date("2026-11-02T00:00:00Z");
  const untrusted = { expiresAt: new Date(now.getTime() + 10 * HOUR), trustedAt: null };

  it("ON moves expiry to exactly 30 days from now and marks the session", () => {
    expect(nextTrustState(true, untrusted, now)).toEqual({ expiresAt: new Date(now.getTime() + 30 * DAY), trustedAt: now });
    expect(TRUSTED_TTL_SECONDS).toBe(30 * 86_400);
  });

  it("ON on a trusted session changes nothing (no way past 30 days)", () => {
    const trusted = { expiresAt: new Date(now.getTime() + 20 * DAY), trustedAt: new Date(now.getTime() - 10 * DAY) };
    expect(nextTrustState(true, trusted, new Date(now.getTime() + DAY))).toBe(trusted);
  });

  it("OFF caps expiry at 24 hours from now, or keeps an earlier one", () => {
    const trusted = { expiresAt: new Date(now.getTime() + 20 * DAY), trustedAt: now };
    expect(nextTrustState(false, trusted, now)).toEqual({ expiresAt: new Date(now.getTime() + DAY), trustedAt: null });
    const soon = { expiresAt: new Date(now.getTime() + 2 * HOUR), trustedAt: now };
    expect(nextTrustState(false, soon, now)).toEqual({ expiresAt: soon.expiresAt, trustedAt: null });
  });
});

describe("setSessionTrust", () => {
  it("ON with the right password: 30 days in the row and in the cookie, other sessions untouched", async () => {
    const u = await seedPasswordUser();
    const other = await seedPasswordUser();
    const mine = await signIn(u.email);
    const second = await signIn(u.email); // same user, another device
    const theirs = await signIn(other.email);
    const secondBefore = await rowOf(tokenOf(second.sessionCookie));
    const theirsBefore = await rowOf(tokenOf(theirs.sessionCookie));

    const before = Date.now();
    const { headers, response } = await setTrust(mine.requestHeaders, { trusted: true, password: TEST_PASSWORD });

    const row = await rowOf(tokenOf(mine.sessionCookie));
    expect(row.trustedAt).not.toBeNull();
    expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 30 * DAY - 1000);
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 30 * DAY);
    expect(response.trusted).toBe(true);

    // The cookie is re-issued under the same name, with a 30 day max-age.
    const line = headers.getSetCookie().find((c) => c.startsWith("better-auth.session_token="));
    expect(line).toBeDefined();
    expect(Number(cookieAttr(line!, "Max-Age"))).toBeGreaterThan(30 * 86_400 - 5);
    expect(Number(cookieAttr(line!, "Max-Age"))).toBeLessThanOrEqual(30 * 86_400);
    expect(tokenOf(line!)).toBe(tokenOf(mine.sessionCookie));
    expect(line).toMatch(/HttpOnly/i);

    expect(await rowOf(tokenOf(second.sessionCookie))).toEqual(secondBefore);
    expect(await rowOf(tokenOf(theirs.sessionCookie))).toEqual(theirsBefore);

    // Still signed in, and the session reports the trusted flag.
    const current = await auth.api.getSession({ headers: mine.requestHeaders });
    expect((current?.session as { trustedAt?: Date | null }).trustedAt).toBeInstanceOf(Date);
  });

  it("rejects a wrong or missing password and changes nothing", async () => {
    const u = await seedPasswordUser();
    const mine = await signIn(u.email);
    const before = await rowOf(tokenOf(mine.sessionCookie));

    await expect(setTrust(mine.requestHeaders, { trusted: true, password: "not-the-password" })).rejects.toMatchObject({ body: { code: "INVALID_PASSWORD" } });
    await expect(setTrust(mine.requestHeaders, { trusted: true })).rejects.toMatchObject({ body: { code: "INVALID_PASSWORD" } });

    expect(await rowOf(tokenOf(mine.sessionCookie))).toEqual(before);
  });

  it("needs a signed-in session", async () => {
    await expect(setTrust(new Headers(), { trusted: true, password: TEST_PASSWORD })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });

  it("allows an account without a password (Google only)", async () => {
    const u = await seedPasswordUser();
    const mine = await signIn(u.email);
    await db.execute(`delete from account where user_id = '${u.id}'`);
    expect(await hasPasswordLogin(u.id)).toBe(false);

    await setTrust(mine.requestHeaders, { trusted: true });

    expect((await rowOf(tokenOf(mine.sessionCookie))).trustedAt).not.toBeNull();
  });

  it("repeating ON does not push expiry further", async () => {
    const u = await seedPasswordUser();
    const mine = await signIn(u.email);
    await setTrust(mine.requestHeaders, { trusted: true, password: TEST_PASSWORD });
    const first = await rowOf(tokenOf(mine.sessionCookie));

    await setTrust(mine.requestHeaders, { trusted: true, password: TEST_PASSWORD });

    expect(await rowOf(tokenOf(mine.sessionCookie))).toEqual(first);
  });

  it("OFF clears the flag and brings expiry back to 24 hours, in the row and the cookie", async () => {
    const u = await seedPasswordUser();
    const mine = await signIn(u.email);
    await setTrust(mine.requestHeaders, { trusted: true, password: TEST_PASSWORD });

    const { headers, response } = await setTrust(mine.requestHeaders, { trusted: false });

    const row = await rowOf(tokenOf(mine.sessionCookie));
    expect(row.trustedAt).toBeNull();
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + DAY);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now() + DAY - 10_000);
    expect(response.trusted).toBe(false);
    const line = headers.getSetCookie().find((c) => c.startsWith("better-auth.session_token="))!;
    expect(Number(cookieAttr(line, "Max-Age"))).toBeLessThanOrEqual(86_400);
  });

  it("OFF keeps an expiry that is already sooner than 24 hours", async () => {
    const u = await seedPasswordUser();
    const mine = await signIn(u.email);
    const soon = new Date(Date.now() + 2 * HOUR);
    await db.update(session).set({ expiresAt: soon, trustedAt: new Date() }).where(eq(session.userId, u.id));

    await setTrust(mine.requestHeaders, { trusted: false });

    expect((await rowOf(tokenOf(mine.sessionCookie))).expiresAt.getTime()).toBe(soon.getTime());
  });

  it("refuses an expired session", async () => {
    const u = await seedPasswordUser();
    const mine = await signIn(u.email);
    await db.update(session).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(session.userId, u.id));

    await expect(setTrust(mine.requestHeaders, { trusted: true, password: TEST_PASSWORD })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });

  it("a new sign-in starts untrusted with a 24 hour window", async () => {
    const u = await seedPasswordUser();
    const first = await signIn(u.email);
    await setTrust(first.requestHeaders, { trusted: true, password: TEST_PASSWORD });

    const again = await signIn(u.email);

    const row = await rowOf(tokenOf(again.sessionCookie));
    expect(row.trustedAt).toBeNull();
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + DAY);
  });
});

describe("migration 0003", () => {
  it("can run twice", async () => {
    await prepareDatabase(); // the drizzle migrator again: nothing pending
    const sqlText = readFileSync(new URL("../../../drizzle/0003_session_trusted_at.sql", import.meta.url), "utf8");
    await db.execute(sqlText);
    await db.execute(sqlText);
    const { rows } = await db.execute<{ column_name: string }>(
      "select column_name from information_schema.columns where table_name = 'session' and column_name = 'trusted_at'",
    );
    expect(rows).toHaveLength(1);
  });
});
