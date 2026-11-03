import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/server/auth";
import { db, pool as pgPool } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { seedPasswordUser, TEST_PASSWORD } from "@/server/test/auth-helpers";
import { githubSignIn } from "@/server/test/github-oauth";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);
afterEach(() => vi.unstubAllGlobals());

const ban = (id: string, fields: { banReason?: string | null; banExpires?: Date | null } = {}) =>
  db.update(user).set({ banned: true, banReason: null, banExpires: null, ...fields }).where(eq(user.id, id));

/** The error a failed sign-in call throws: Better Auth's APIError with a status and a body of { code, message }. */
async function failure(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (err) {
    const e = err as { status?: string; statusCode?: number; body?: { code?: string; message?: string } };
    return { status: e.statusCode, code: e.body?.code, message: e.body?.message ?? "" };
  }
  throw new Error("expected the sign-in to fail");
}

const byEmail = (email: string, password = TEST_PASSWORD) => () => auth.api.signInEmail({ body: { email, password }, headers: new Headers() });
const byUsername = (username: string, password = TEST_PASSWORD) => () => auth.api.signInUsername({ body: { username, password }, headers: new Headers() });

describe("banned user signs in with the right password", () => {
  it("by email: BANNED_USER with the reason", async () => {
    const u = await seedPasswordUser();
    await ban(u.id, { banReason: "Penyalahgunaan API" });

    const f = await failure(byEmail(u.email));

    expect(f).toMatchObject({ status: 403, code: "BANNED_USER" });
    expect(f.message).toBe("Akun Anda diblokir. Alasan: Penyalahgunaan API. Hubungi dukungan bila Anda merasa ini keliru.");
  });

  it("by username: the same", async () => {
    const u = await seedPasswordUser();
    await db.update(user).set({ username: "ada_1", displayUsername: "ada_1" }).where(eq(user.id, u.id));
    await ban(u.id, { banReason: "Spam" });

    const f = await failure(byUsername("ada_1"));

    expect(f).toMatchObject({ code: "BANNED_USER" });
    expect(f.message).toContain("Alasan: Spam.");
  });

  it("without a reason the message stays tidy", async () => {
    const u = await seedPasswordUser();
    await ban(u.id);

    const f = await failure(byEmail(u.email));

    expect(f.code).toBe("BANNED_USER");
    expect(f.message).toBe("Akun Anda diblokir. Hubungi dukungan bila Anda merasa ini keliru.");
  });

  it("a ban with an end date says until when", async () => {
    const u = await seedPasswordUser();
    await ban(u.id, { banReason: "Spam", banExpires: new Date("2999-01-02T03:04:00Z") });

    expect((await failure(byEmail(u.email))).message).toContain("sampai 2 Januari 2999 03.04 UTC");
  });

  it("an expired ban lifts itself and the sign-in works", async () => {
    const u = await seedPasswordUser();
    await ban(u.id, { banReason: "Spam", banExpires: new Date(Date.now() - 60_000) });

    const res = await auth.api.signInEmail({ body: { email: u.email, password: TEST_PASSWORD }, headers: new Headers() });

    expect(res.user.id).toBe(u.id);
    const [row] = await db.select({ banned: user.banned, banReason: user.banReason, banExpires: user.banExpires }).from(user).where(eq(user.id, u.id));
    expect(row).toEqual({ banned: false, banReason: null, banExpires: null });
  });
});

describe("banned user with the wrong password", () => {
  it("gets the ordinary credential error and no word about a ban", async () => {
    const u = await seedPasswordUser();
    await ban(u.id, { banReason: "Rahasia operator" });

    const wrong = await failure(byEmail(u.email, "not-the-password"));
    const unknown = await failure(byEmail("nobody@example.com", "not-the-password"));

    expect(wrong.code).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect(wrong.message).not.toMatch(/diblokir|banned|Rahasia/i);
    expect(wrong).toEqual(unknown);
  });
});

describe("banned user signs in with GitHub", () => {
  it("is sent back to /login with BANNED_USER and gets no session", async () => {
    const u = await seedPasswordUser();
    await ban(u.id, { banReason: "Spam" });

    const res = await githubSignIn({ id: 321, login: "banned", email: u.email, verified: true });

    expect(res.signedIn).toBe(false);
    const to = new URL(res.location, "https://aedoxy.test");
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("error")).toBe("BANNED_USER");
  });
});
