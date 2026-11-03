import { and, eq, ne } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { account, user } from "@/server/db/schema";
import { seedPasswordUser, signIn } from "@/server/test/auth-helpers";
import { auth } from "@/server/auth";
import { githubLink, githubSignIn } from "@/server/test/github-oauth";
import { prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);
afterEach(() => vi.unstubAllGlobals());

/** Social accounts only: a password credential row is not what these tests are about. */
const accountsOf = (userId: string) =>
  db.select({ providerId: account.providerId, accountId: account.accountId }).from(account).where(and(eq(account.userId, userId), ne(account.providerId, "credential")));

describe("GitHub sign-in against existing accounts", () => {
  it("joins the existing user with the same email when GitHub verified that email", async () => {
    const existing = await seedUser({ email: "ada@example.com", emailVerified: true });

    const res = await githubSignIn({ id: 101, login: "ada", email: "Ada@Example.com", verified: true });

    expect(res.signedIn).toBe(true);
    expect(await db.select({ id: user.id }).from(user)).toHaveLength(1);
    expect(await accountsOf(existing.id)).toEqual([{ providerId: "github", accountId: "101" }]);
  });

  it("does not take over an account when GitHub has not verified the email", async () => {
    const victim = await seedUser({ email: "victim@example.com", emailVerified: true });

    const res = await githubSignIn({ id: 666, login: "attacker", email: "victim@example.com", verified: false });

    expect(res.signedIn).toBe(false);
    expect(res.location).toContain("/login");
    expect(await accountsOf(victim.id)).toEqual([]);
    expect(await db.select({ id: user.id }).from(user)).toHaveLength(1);
  });

  it("does not create a user from an unverified GitHub email", async () => {
    const res = await githubSignIn({ id: 7, login: "newbie", email: "nobody@example.com", verified: false });

    expect(res.signedIn).toBe(false);
    expect(await db.select({ id: user.id }).from(user)).toHaveLength(0);
  });

  it("does not link to a local account whose own email is still unverified", async () => {
    const squatted = await seedUser({ email: "sq@example.com", emailVerified: false });

    const res = await githubSignIn({ id: 8, login: "sq", email: "sq@example.com", verified: true });

    expect(res.signedIn).toBe(false);
    expect(await accountsOf(squatted.id)).toEqual([]);
  });

  it("creates a verified user for a new GitHub account", async () => {
    const res = await githubSignIn({ id: 9, login: "newbie", email: "newbie@example.com", verified: true });

    expect(res.signedIn).toBe(true);
    const [row] = await db.select().from(user);
    expect(row).toMatchObject({ email: "newbie@example.com", emailVerified: true });
  });
});

describe("linking GitHub from settings", () => {
  it("links when the verified GitHub email matches", async () => {
    const existing = await seedPasswordUser();
    const { requestHeaders } = await signIn(existing.email);

    await githubLink({ id: 55, login: "linker", email: existing.email, verified: true }, requestHeaders);

    expect(await accountsOf(existing.id)).toEqual([{ providerId: "github", accountId: "55" }]);
  });

  it("refuses an unverified GitHub email", async () => {
    const existing = await seedPasswordUser();
    const { requestHeaders } = await signIn(existing.email);

    await githubLink({ id: 56, login: "linker", email: existing.email, verified: false }, requestHeaders);

    expect(await accountsOf(existing.id)).toEqual([]);
  });
});

describe("unlinking sign-in methods", () => {
  const unlink = async (requestHeaders: Headers, accountId: string) => {
    const res = await auth.handler(
      new Request("https://aedoxy.test/api/auth/unlink-account", {
        method: "POST",
        headers: { cookie: requestHeaders.get("cookie")!, origin: "https://aedoxy.test", "content-type": "application/json" },
        body: JSON.stringify({ accountId }),
      }),
    );
    return { status: res.status, body: (await res.json()) as { code?: string } };
  };
  const rowsOf = (userId: string) => db.select({ id: account.id, providerId: account.providerId }).from(account).where(eq(account.userId, userId));

  it("is refused by the server for the last remaining method", async () => {
    const u = await seedPasswordUser();
    const { requestHeaders } = await signIn(u.email);
    const [only] = await rowsOf(u.id);

    const res = await unlink(requestHeaders, only.id);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("FAILED_TO_UNLINK_LAST_ACCOUNT");
    expect(await rowsOf(u.id)).toHaveLength(1);
  });

  it("works while another method remains, then protects the one left", async () => {
    const u = await seedPasswordUser();
    const { requestHeaders } = await signIn(u.email);
    await githubLink({ id: 77, login: "both", email: u.email, verified: true }, requestHeaders);
    const rows = await rowsOf(u.id);
    expect(rows).toHaveLength(2);

    const github = rows.find((r) => r.providerId === "github")!;
    expect((await unlink(requestHeaders, github.id)).status).toBe(200);

    const left = await rowsOf(u.id);
    expect(left.map((r) => r.providerId)).toEqual(["credential"]);
    expect((await unlink(requestHeaders, left[0].id)).body.code).toBe("FAILED_TO_UNLINK_LAST_ACCOUNT");
  });

  it("will not remove an account that belongs to someone else", async () => {
    const a = await seedPasswordUser();
    const b = await seedPasswordUser();
    const { requestHeaders } = await signIn(a.email);
    await githubLink({ id: 78, login: "a", email: a.email, verified: true }, requestHeaders);
    const [bAccount] = await rowsOf(b.id);

    const res = await unlink(requestHeaders, bAccount.id);

    expect(res.status).toBe(400);
    expect(await rowsOf(b.id)).toHaveLength(1);
  });
});