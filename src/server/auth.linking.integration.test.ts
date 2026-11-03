import { and, eq, ne } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { account, user } from "@/server/db/schema";
import { seedPasswordUser, signIn } from "@/server/test/auth-helpers";
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
