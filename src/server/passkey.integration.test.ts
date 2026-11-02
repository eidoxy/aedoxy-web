import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { classifyAdmin } from "@/server/admin";
import { auth } from "@/server/auth";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, freshAuth, passkey, session, user } from "@/server/db/schema";
import { grantFreshAuth } from "@/server/domain/fresh-auth";
import { relyingPartyFor } from "@/server/passkey-policy";
import { seedPasswordUser, signIn } from "@/server/test/auth-helpers";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { cookieHeader, createAuthenticator } from "@/server/test/webauthn";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const origin = "https://aedoxy.test";
const rp = relyingPartyFor(origin);

async function signedInUser() {
  const u = await seedPasswordUser();
  const s = await signIn(u.email);
  const [row] = await db.select().from(session).where(eq(session.userId, u.id));
  return { u, sessionId: row.id, setCookie: s.setCookie, headers: s.requestHeaders };
}

/** Runs the browser-side registration against the real endpoints and returns the verify call's outcome. */
async function registerPasskey(who: Awaited<ReturnType<typeof signedInUser>>, authenticator: ReturnType<typeof createAuthenticator>, name = "Laptop") {
  const { headers: optionHeaders, response: options } = await auth.api.generatePasskeyRegistrationOptions({ headers: who.headers, query: { name }, returnHeaders: true });
  const headers = new Headers({ cookie: cookieHeader(who.setCookie, optionHeaders.getSetCookie()), origin });
  return auth.api.verifyPasskeyRegistration({ headers, body: { response: authenticator.register(options.challenge) as never, name } });
}

describe("relyingPartyFor", () => {
  it("derives the rp id and origin from the site URL only", () => {
    expect(relyingPartyFor("http://localhost:3000")).toEqual({ rpID: "localhost", origin: "http://localhost:3000" });
    expect(relyingPartyFor("https://aedoxy.com/some/path")).toEqual({ rpID: "aedoxy.com", origin: "https://aedoxy.com" });
  });
});

describe("adding a passkey", () => {
  it("is refused without the password + 2FA confirmation, whatever the session", async () => {
    const who = await signedInUser();
    await expect(auth.api.generatePasskeyRegistrationOptions({ headers: who.headers })).rejects.toMatchObject({ body: { code: "PASSKEY_CONFIRMATION_REQUIRED" } });
    await expect(registerPasskey(who, createAuthenticator({ ...rp }))).rejects.toMatchObject({ body: { code: "PASSKEY_CONFIRMATION_REQUIRED" } });
    expect(await db.select().from(passkey)).toHaveLength(0);
  });

  it("is refused for a different session of the same user", async () => {
    const who = await signedInUser();
    const other = await signIn((await db.select().from(user).where(eq(user.id, who.u.id)))[0].email);
    await grantFreshAuth(who.sessionId, "passkey_register");
    const [, second] = await db.select().from(session).where(eq(session.userId, who.u.id));
    expect(second).toBeDefined();
    await expect(auth.api.generatePasskeyRegistrationOptions({ headers: other.requestHeaders })).rejects.toMatchObject({ body: { code: "PASSKEY_CONFIRMATION_REQUIRED" } });
  });

  it("works once after the confirmation, stores the credential and audits, then needs a new confirmation", async () => {
    const who = await signedInUser();
    await grantFreshAuth(who.sessionId, "passkey_register");
    const authenticator = createAuthenticator({ ...rp });

    await registerPasskey(who, authenticator);

    const [row] = await db.select().from(passkey);
    expect(row).toMatchObject({ userId: who.u.id, credentialID: authenticator.credentialId, name: "Laptop" });
    expect(await db.select().from(freshAuth)).toHaveLength(0);
    const audit = await db.select().from(adminAuditLog);
    expect(audit.map((a) => a.action)).toEqual(["admin.passkey.add"]);

    await expect(registerPasskey(who, createAuthenticator({ ...rp }), "Second")).rejects.toMatchObject({ body: { code: "PASSKEY_CONFIRMATION_REQUIRED" } });
  });

  it("rejects a credential made without user verification", async () => {
    const who = await signedInUser();
    await grantFreshAuth(who.sessionId, "passkey_register");
    const authenticator = createAuthenticator({ ...rp });
    const { headers: optionHeaders, response: options } = await auth.api.generatePasskeyRegistrationOptions({ headers: who.headers, returnHeaders: true });
    const headers = new Headers({ cookie: cookieHeader(who.setCookie, optionHeaders.getSetCookie()), origin });

    await expect(auth.api.verifyPasskeyRegistration({ headers, body: { response: authenticator.register(options.challenge, { userVerified: false }) as never } })).rejects.toMatchObject({
      body: { code: "USER_VERIFICATION_REQUIRED" },
    });
    expect(await db.select().from(passkey)).toHaveLength(0);
  });
});

describe("signing in with a passkey", () => {
  async function adminWithPasskey() {
    const who = await signedInUser();
    await db.update(user).set({ role: "admin", twoFactorEnabled: true }).where(eq(user.id, who.u.id));
    const authenticator = createAuthenticator({ ...rp });
    await grantFreshAuth(who.sessionId, "passkey_register");
    await registerPasskey(who, authenticator);
    return { ...who, authenticator };
  }

  async function assertion(authenticator: ReturnType<typeof createAuthenticator>, opts?: { userVerified?: boolean }) {
    const { headers, response: options } = await auth.api.generatePasskeyAuthenticationOptions({ headers: new Headers(), returnHeaders: true });
    return { headers: new Headers({ cookie: cookieHeader(headers.getSetCookie()), origin }), response: authenticator.assert(options.challenge, opts) };
  }

  it("signs in without any TOTP, and an admin with 2FA enabled still passes the admin gate", async () => {
    const { u, authenticator } = await adminWithPasskey();
    const { headers, response } = await assertion(authenticator);

    const { headers: out, response: result } = await auth.api.verifyPasskeyAuthentication({ headers, body: { response: response as never }, returnHeaders: true });
    expect(result.user.id).toBe(u.id);

    const cookie = cookieHeader(out.getSetCookie());
    const current = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(current?.user.id).toBe(u.id);
    expect(classifyAdmin(current).kind).toBe("ok");
  });

  it("does not turn an admin without TOTP into a full admin", async () => {
    const { u, authenticator } = await adminWithPasskey();
    await db.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, u.id));
    const { headers, response } = await assertion(authenticator);
    const { headers: out } = await auth.api.verifyPasskeyAuthentication({ headers, body: { response: response as never }, returnHeaders: true });
    const current = await auth.api.getSession({ headers: new Headers({ cookie: cookieHeader(out.getSetCookie()) }) });
    expect(classifyAdmin(current).kind).toBe("needs_2fa");
  });

  it("refuses an assertion without user verification and creates no session", async () => {
    const { u, authenticator } = await adminWithPasskey();
    const before = (await db.select().from(session).where(eq(session.userId, u.id))).length;
    const { headers, response } = await assertion(authenticator, { userVerified: false });

    await expect(auth.api.verifyPasskeyAuthentication({ headers, body: { response: response as never } })).rejects.toMatchObject({ body: { code: "USER_VERIFICATION_REQUIRED" } });
    expect(await db.select().from(session).where(eq(session.userId, u.id))).toHaveLength(before);
  });

  it("refuses a challenge that was already used", async () => {
    const { authenticator } = await adminWithPasskey();
    const { headers, response } = await assertion(authenticator);
    await auth.api.verifyPasskeyAuthentication({ headers, body: { response: response as never } });
    await expect(auth.api.verifyPasskeyAuthentication({ headers, body: { response: response as never } })).rejects.toMatchObject({ body: { code: "CHALLENGE_NOT_FOUND" } });
  });
});

describe("closed HTTP routes", () => {
  it.each(["/passkey/delete-passkey", "/passkey/update-passkey"])("%s answers 404 over HTTP", async (path) => {
    const res = await auth.handler(new Request(`https://aedoxy.test/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin }, body: "{}" }));
    expect(res.status).toBe(404);
  });
});
