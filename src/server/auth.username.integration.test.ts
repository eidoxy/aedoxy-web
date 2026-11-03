import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/server/auth";
import { db, pool as pgPool } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { githubSignIn } from "@/server/test/github-oauth";
import { prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";
import { assignGeneratedUsername } from "@/server/username";

// The app mails verification links in the background; capture them instead of sending.
const sent = vi.hoisted(() => [] as { to: string; subject: string; text: string }[]);
vi.mock("@/server/email", () => ({ sendEmail: async (m: { to: string; subject: string; text: string }) => void sent.push(m) }));

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  sent.length = 0;
  await resetDatabase();
});
afterEach(() => vi.unstubAllGlobals());

const PASSWORD = "correct-horse-battery";

async function signUp(username: string, email: string) {
  return auth.api.signUpEmail({ body: { name: username, username, email, password: PASSWORD } });
}

/** Opens the verification link that the sign-up mailed, like the user would. */
async function verifyEmailOf(email: string) {
  const mail = await vi.waitFor(() => {
    const m = sent.find((s) => s.to === email && s.subject.startsWith("Verifikasi"));
    if (!m) throw new Error("no verification email yet");
    return m;
  });
  const token = new URL(/https?:\/\/\S+/.exec(mail.text)![0]).searchParams.get("token")!;
  await auth.api.verifyEmail({ query: { token } });
}

const rowByEmail = async (email: string) => (await db.select().from(user).where(eq(user.email, email)))[0];

describe("username sign-up and sign-in", () => {
  it("stores the username in lowercase and signs in with it after the email is verified", async () => {
    await signUp("Ada_Lovelace", "ada@example.com");

    const row = await rowByEmail("ada@example.com");
    expect(row).toMatchObject({ username: "ada_lovelace", displayUsername: "ada_lovelace", name: "Ada_Lovelace" });

    // Same message and code as the email route for an unverified account.
    await expect(auth.api.signInUsername({ body: { username: "ada_lovelace", password: PASSWORD } })).rejects.toMatchObject({ body: { code: "EMAIL_NOT_VERIFIED" } });
    await expect(auth.api.signInEmail({ body: { email: "ada@example.com", password: PASSWORD } })).rejects.toMatchObject({ body: { code: "EMAIL_NOT_VERIFIED" } });

    await verifyEmailOf("ada@example.com");

    const byUsername = await auth.api.signInUsername({ body: { username: "ADA_Lovelace", password: PASSWORD } });
    expect(byUsername.user.id).toBe(row.id);
    const byEmail = await auth.api.signInEmail({ body: { email: "ada@example.com", password: PASSWORD } });
    expect(byEmail.user.id).toBe(row.id);
  });

  it("gives the same answer for a wrong password and an unknown username", async () => {
    await signUp("ada_l", "ada2@example.com");
    await verifyEmailOf("ada2@example.com");

    await expect(auth.api.signInUsername({ body: { username: "ada_l", password: "wrong-wrong-wrong" } })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
    await expect(auth.api.signInUsername({ body: { username: "nobody_here", password: "wrong-wrong-wrong" } })).rejects.toMatchObject({ status: "UNAUTHORIZED" });
  });

  it("rejects a duplicate username, whatever its case", async () => {
    await signUp("taken_name", "one@example.com");

    await expect(signUp("Taken_Name", "two@example.com")).rejects.toMatchObject({ body: { code: "USERNAME_IS_ALREADY_TAKEN" } });
    expect(await db.select({ id: user.id }).from(user)).toHaveLength(1);
  });

  it.each([
    ["ab", "USERNAME_TOO_SHORT"],
    ["a".repeat(21), "USERNAME_TOO_LONG"],
    ["has space", "INVALID_USERNAME"],
    ["dot.name", "INVALID_USERNAME"],
    ["Admin", "INVALID_USERNAME"],
    ["console", "INVALID_USERNAME"],
  ])("rejects the username %j", async (name, code) => {
    await expect(signUp(name, "bad@example.com")).rejects.toMatchObject({ body: { code } });
    expect(await rowByEmail("bad@example.com")).toBeUndefined();
  });

  it("closes the availability endpoint and rate limits username sign-in like email sign-in", async () => {
    const res = await auth.handler(
      new Request("https://aedoxy.test/api/auth/is-username-available", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "someone" }) }),
    );
    expect(res.status).toBe(404);
    expect(auth.options.rateLimit?.customRules?.["/sign-in/username"]).toEqual({ window: 60, max: 5 });
  });
});

describe("generated usernames for social sign-ups", () => {
  it("gives two GitHub users with the same login different usernames", async () => {
    await githubSignIn({ id: 1, login: "OctoCat", email: "octo1@example.com", verified: true });
    await githubSignIn({ id: 2, login: "octocat", email: "octo2@example.com", verified: true });

    const rows = await db.select({ username: user.username, display: user.displayUsername, email: user.email }).from(user);
    const names = rows.map((r) => r.username);
    expect(rowOf(rows, "octo1@example.com").username).toBe("octocat");
    expect(rowOf(rows, "octo2@example.com").username).toMatch(/^octocat\d{2,}$/);
    expect(new Set(names).size).toBe(2);
    expect(rowOf(rows, "octo2@example.com").display).toBe(rowOf(rows, "octo2@example.com").username);
  });

  it("falls back to the email local part when there is no login, and avoids reserved names", async () => {
    await githubSignIn({ id: 3, login: "", email: "Jane.Doe+x@example.com", verified: true });
    await githubSignIn({ id: 4, login: "Admin", email: "someone@example.com", verified: true });

    expect((await rowByEmail("jane.doe+x@example.com")).username).toBe("janedoex");
    expect((await rowByEmail("someone@example.com")).username).toBe("admin_user");
  });

  it("survives a burst of simultaneous claims for the same base, relying on the unique index", async () => {
    const users = await Promise.all(Array.from({ length: 8 }, () => seedUser()));

    const chosen = await Promise.all(users.map((u) => assignGeneratedUsername(u.id, "samename")));

    expect(chosen.every((n) => n && /^samename\d{0,6}$/.test(n))).toBe(true);
    expect(new Set(chosen).size).toBe(8);
    const stored = (await db.select({ username: user.username }).from(user)).map((r) => r.username);
    expect(new Set(stored)).toEqual(new Set(chosen));
  });

  it("never overwrites a username the user already has", async () => {
    const [u] = await Promise.all([seedUser({ username: "mine_123" })]);
    expect(await assignGeneratedUsername(u.id, "other")).toBeNull();
    expect((await rowByEmail(u.email)).username).toBe("mine_123");
  });
});

const rowOf = <T extends { email: string }>(rows: T[], email: string) => rows.find((r) => r.email === email)!;
