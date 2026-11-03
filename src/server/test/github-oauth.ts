import { vi } from "vitest";
import { auth } from "@/server/auth";

export type GithubProfile = { id: number; login: string; email: string | null; verified: boolean; name?: string };

/**
 * Drives the real Better Auth GitHub flow end to end without the network: signInSocial / linkSocial builds the state, then the
 * callback endpoint runs against a fetch stub that plays github.com and api.github.com. Anything else the app fetches (the
 * console bridge) answers 503, which the app treats as best effort.
 */
function stubGithub(p: GithubProfile) {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = new URL(String(input));
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    if (url.host === "github.com" && url.pathname === "/login/oauth/access_token") return json({ access_token: "gho_test", token_type: "bearer", scope: "read:user,user:email" });
    if (url.host === "api.github.com" && url.pathname === "/user") return json({ id: p.id, login: p.login, name: p.name ?? null, email: null, avatar_url: null });
    if (url.host === "api.github.com" && url.pathname === "/user/emails") return json(p.email ? [{ email: p.email, primary: true, verified: p.verified, visibility: null }] : []);
    return new Response("unavailable", { status: 503 });
  });
}

const cookieHeader = (setCookie: string[]) => setCookie.map((c) => c.split(";")[0]).join("; ");

/** Completes the OAuth round trip, as a browser navigation (sec-fetch-mode: navigate; the OIDC plugin answers navigations with a redirect and everything else with JSON). Returns the callback response, where `Location` is either the callbackURL or an error URL. */
async function callback(startUrl: string, startCookies: string[], extraCookie: string | undefined) {
  const state = new URL(startUrl).searchParams.get("state");
  if (!state) throw new Error("no state in the authorization URL");
  const cookie = [cookieHeader(startCookies), extraCookie].filter(Boolean).join("; ");
  return auth.handler(new Request(`https://aedoxy.test/api/auth/callback/github?code=test-code&state=${state}`, { headers: { cookie, "sec-fetch-mode": "navigate" } }));
}

type SignInOptions = {
  /** The signed query of an OIDC request (what the client plugin sends as `oauth_query` from /login?...&sig=...). Goes through the HTTP handler, like the browser. */
  oauthQuery?: string;
  /** Runs between "redirect to GitHub" and "back from GitHub", e.g. to switch the provider off mid round trip. */
  beforeCallback?: () => Promise<void>;
};

async function startSignIn(oauthQuery: string | undefined) {
  if (!oauthQuery) {
    const { headers, response } = await auth.api.signInSocial({ body: { provider: "github", callbackURL: "/dashboard", errorCallbackURL: "/login" }, returnHeaders: true });
    return { url: response.url!, cookies: headers.getSetCookie() };
  }
  const res = await auth.handler(
    new Request("https://aedoxy.test/api/auth/sign-in/social", {
      method: "POST",
      headers: { origin: "https://aedoxy.test", "content-type": "application/json" },
      body: JSON.stringify({ provider: "github", callbackURL: "/dashboard", errorCallbackURL: "/login", oauth_query: oauthQuery }),
    }),
  );
  const body = (await res.json()) as { url?: string };
  if (!body.url) throw new Error(`social sign-in did not start: HTTP ${res.status}`);
  return { url: body.url, cookies: res.headers.getSetCookie() };
}

export async function githubSignIn(p: GithubProfile, opts: SignInOptions = {}) {
  stubGithub(p);
  const start = await startSignIn(opts.oauthQuery);
  await opts.beforeCallback?.();
  const res = await callback(start.url, start.cookies, undefined);
  const location = res.headers.get("location") ?? "";
  const setCookie = res.headers.getSetCookie();
  const sessionCookie = setCookie.map((c) => c.split(";")[0]).find((c) => c.startsWith("better-auth.session_token="));
  return { location, signedIn: Boolean(sessionCookie), requestHeaders: sessionCookie ? new Headers({ cookie: sessionCookie }) : undefined };
}

/** "Tautkan" from /settings: a signed-in user starts the GitHub flow. */
export async function githubLink(p: GithubProfile, sessionHeaders: Headers) {
  stubGithub(p);
  const { headers, response } = await auth.api.linkSocialAccount({
    body: { provider: "github", callbackURL: "/settings", errorCallbackURL: "/settings" },
    headers: sessionHeaders,
    returnHeaders: true,
  });
  const res = await callback(response.url!, headers.getSetCookie(), sessionHeaders.get("cookie") ?? undefined);
  return { location: res.headers.get("location") ?? "" };
}
