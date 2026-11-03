import { createHash, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// getSiteSettings is "use cache"; outside Next, cacheTag/cacheLife need a stand-in. The database read is real.
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

import { auth } from "@/server/auth";
import { db, pool as pgPool } from "@/server/db/client";
import { oauthClient } from "@/server/db/schema";
import { githubSignIn } from "@/server/test/github-oauth";
import { prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);
afterEach(() => vi.unstubAllGlobals());

const CLIENT_ID = "console-test-client";
const REDIRECT = "https://console.test/oauth/aedoxy";

/** Same row as scripts/seed-oauth-client.ts: first-party console client, no consent screen, no PKCE. */
async function seedConsoleClient() {
  const now = new Date();
  await db.insert(oauthClient).values({
    id: randomUUID(),
    clientId: CLIENT_ID,
    clientSecret: createHash("sha256").update("test-secret").digest("base64url"),
    name: "Aedoxy Console",
    redirectUris: [REDIRECT],
    scopes: ["openid", "profile", "email"],
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "client_secret_post",
    applicationType: "web",
    skipConsent: true,
    requirePKCE: false,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  });
}

/** What the console does: send the browser to /oauth2/authorize. Without a session the server answers with a redirect to /login?...&sig=... */
async function consoleAuthorizeRedirect() {
  const url = new URL("https://aedoxy.test/api/auth/oauth2/authorize");
  url.search = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: "code", scope: "openid email profile", state: "console-state-1" }).toString();
  const res = await auth.handler(new Request(url));
  const to = new URL(res.headers.get("location") ?? "", "https://aedoxy.test");
  return to;
}

describe("social sign-in during the console's OIDC flow", () => {
  beforeEach(seedConsoleClient);

  it("the console is sent to /login with a signed query", async () => {
    const to = await consoleAuthorizeRedirect();
    expect(to.pathname).toBe("/login");
    expect(to.searchParams.get("sig")).toBeTruthy();
  });

  it("with the signed query, GitHub sign-in ends back at the console with a code, not at /dashboard", async () => {
    await seedUser({ email: "ada@example.com", emailVerified: true });
    const to = await consoleAuthorizeRedirect();

    const res = await githubSignIn({ id: 101, login: "ada", email: "ada@example.com", verified: true }, { oauthQuery: to.search.slice(1) });

    expect(res.signedIn).toBe(true);
    const back = new URL(res.location);
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get("code")).toBeTruthy();
    expect(back.searchParams.get("state")).toBe("console-state-1");
  });

  it("a brand-new GitHub user (the register page's case) is carried back to the console too", async () => {
    const to = await consoleAuthorizeRedirect();

    const res = await githubSignIn({ id: 202, login: "newbie", email: "newbie@example.com", verified: true }, { oauthQuery: to.search.slice(1) });

    expect(res.signedIn).toBe(true);
    expect(new URL(res.location).origin + new URL(res.location).pathname).toBe(REDIRECT);
  });

  it("without the signed query the same sign-in lands on /dashboard", async () => {
    await seedUser({ email: "ada@example.com", emailVerified: true });

    const res = await githubSignIn({ id: 101, login: "ada", email: "ada@example.com", verified: true });

    expect(res.signedIn).toBe(true);
    expect(res.location).toBe("/dashboard");
  });

  it("a forged signature is refused and nothing continues the flow", async () => {
    await seedUser({ email: "ada@example.com", emailVerified: true });
    const to = await consoleAuthorizeRedirect();
    const forged = to.search.slice(1).replace(/sig=[^&]+/, "sig=forged");

    await expect(githubSignIn({ id: 101, login: "ada", email: "ada@example.com", verified: true }, { oauthQuery: forged })).rejects.toThrow(/did not start/);
  });
});
