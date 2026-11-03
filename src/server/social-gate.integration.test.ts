import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// getSiteSettings is "use cache"; outside Next the directive does nothing, but cacheTag/cacheLife need a Next runtime. The database read is real.
vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {}, updateTag: () => {}, revalidatePath: () => {} }));

import { auth } from "@/server/auth";
import { db, pool as pgPool } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { saveSiteSection } from "@/server/domain/site-settings";
import { seedPasswordUser, signIn } from "@/server/test/auth-helpers";
import { githubSignIn } from "@/server/test/github-oauth";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);
afterEach(() => vi.unstubAllGlobals());

const actor = { id: "admin-1", ip: null };
const setSwitches = (google: boolean, github: boolean) => saveSiteSection(actor, "social", { googleLoginEnabled: google, githubLoginEnabled: github });

/** The HTTP route, as a browser (or a script) would call it. */
const post = async (path: string, body: unknown, cookie?: string) => {
  const res = await auth.handler(
    new Request(`https://aedoxy.test/api/auth${path}`, {
      method: "POST",
      headers: { origin: "https://aedoxy.test", "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as { code?: string; message?: string; url?: string } };
};

describe("provider switched off", () => {
  beforeEach(() => setSwitches(true, false));

  it("refuses GitHub sign-in over HTTP and still starts Google", async () => {
    const github = await post("/sign-in/social", { provider: "github", callbackURL: "/dashboard" });
    expect(github.status).toBe(403);
    expect(github.body).toMatchObject({ code: "SOCIAL_LOGIN_DISABLED", message: "Login dengan GitHub sedang dinonaktifkan." });

    const google = await post("/sign-in/social", { provider: "google", callbackURL: "/dashboard" });
    expect(google.status).toBe(200);
    expect(google.body.url).toContain("accounts.google.com");
  });

  it("refuses to link GitHub from settings and still links Google", async () => {
    const u = await seedPasswordUser();
    const { sessionCookie } = await signIn(u.email);
    const cookie = sessionCookie.split(";")[0];

    const github = await post("/link-social", { provider: "github", callbackURL: "/settings" }, cookie);
    expect(github.status).toBe(403);
    expect(github.body.code).toBe("SOCIAL_LOGIN_DISABLED");

    const google = await post("/link-social", { provider: "google", callbackURL: "/settings" }, cookie);
    expect(google.status).toBe(200);
    expect(google.body.url).toContain("accounts.google.com");
  });

  it("refuses the server-side call too, not only the HTTP route", async () => {
    await expect(auth.api.signInSocial({ body: { provider: "github", callbackURL: "/dashboard" } })).rejects.toMatchObject({ body: { code: "SOCIAL_LOGIN_DISABLED" } });
  });

  it("turns back a callback that arrives after the switch went off: no user, no session", async () => {
    await setSwitches(true, true);

    const res = await githubSignIn({ id: 404, login: "late", email: "late@example.com", verified: true }, { beforeCallback: () => setSwitches(true, false).then(() => undefined) });

    expect(res.signedIn).toBe(false);
    const to = new URL(res.location);
    expect(to.origin + to.pathname).toBe("https://aedoxy.test/login");
    expect(to.searchParams.get("error")).toBe("social_login_disabled_github");
    expect(await db.select({ id: user.id }).from(user)).toHaveLength(0);
  });

  it("switching it back on lets the sign-in through", async () => {
    await setSwitches(true, true);

    const res = await githubSignIn({ id: 406, login: "back", email: "back@example.com", verified: true });

    expect(res.signedIn).toBe(true);
  });
});

describe("defaults", () => {
  it("with nothing saved both providers work", async () => {
    const res = await githubSignIn({ id: 500, login: "fresh", email: "fresh@example.com", verified: true });
    expect(res.signedIn).toBe(true);
    expect((await post("/sign-in/social", { provider: "google", callbackURL: "/dashboard" })).status).toBe(200);
  });
});
