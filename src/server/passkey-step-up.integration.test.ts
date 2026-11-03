import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => current.headers, cookies: async () => ({ set() {}, get: () => undefined, getAll: () => [] }) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { requireFreshAuth, requireFreshTotp } from "@/server/admin";
import { auth } from "@/server/auth";
import { db, pool as pgPool } from "@/server/db/client";
import { freshAuth, passkey, session, user } from "@/server/db/schema";
import { relyingPartyFor, STEP_UP_HEADER } from "@/server/passkey-policy";
import { seedPasswordUser, signIn } from "@/server/test/auth-helpers";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { cookieHeader, createAuthenticator } from "@/server/test/webauthn";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const origin = "https://aedoxy.test";
const rp = relyingPartyFor(origin);

/** An admin (2FA on) with one registered passkey and a signed-in session. */
async function adminWithPasskey() {
  const u = await seedPasswordUser();
  const s = await signIn(u.email);
  const second = await signIn(u.email); // another session of the same user, made before 2FA is switched on
  await db.update(user).set({ role: "admin", twoFactorEnabled: true }).where(eq(user.id, u.id));
  const [row] = await db.select().from(session).where(eq(session.token, decodeURIComponent(s.sessionCookie.split(";")[0].split("=")[1]).split(".")[0]));
  const authenticator = createAuthenticator({ ...rp });
  await db.insert(passkey).values({
    id: `pk-${u.id}`,
    userId: u.id,
    name: "Laptop",
    credentialID: authenticator.credentialId,
    publicKey: authenticator.publicKeyBase64,
    counter: 0,
    deviceType: "singleDevice",
    backedUp: false,
    createdAt: new Date(),
  });
  return { u, authenticator, sessionId: row.id, headers: s.requestHeaders, setCookie: s.setCookie, secondHeaders: second.requestHeaders };
}
type Admin = Awaited<ReturnType<typeof adminWithPasskey>>;

/** What the "Gunakan passkey" button does: options with the session cookie, then a verify call with the step-up header. */
async function stepUp(who: Pick<Admin, "headers" | "setCookie">, authenticator: ReturnType<typeof createAuthenticator>, opts?: { userVerified?: boolean }) {
  const { headers: out, response: options } = await auth.api.generatePasskeyAuthenticationOptions({ headers: who.headers, returnHeaders: true });
  const headers = new Headers({ cookie: cookieHeader(who.setCookie, out.getSetCookie()), origin, [STEP_UP_HEADER]: "1" });
  return auth.api.verifyPasskeyAuthentication({ headers, body: { response: authenticator.assert(options.challenge, opts) as never } });
}

describe("passkey as a fresh proof for sensitive actions", () => {
  it("is accepted once, creates no new session, and the next sensitive action must prove again", async () => {
    const who = await adminWithPasskey();
    await expect(stepUp(who, who.authenticator)).rejects.toMatchObject({ body: { code: "STEP_UP_OK" } });
    expect(await db.select().from(session).where(eq(session.userId, who.u.id))).toHaveLength(2); // the two made in setup, none added

    current.headers = who.headers;
    await expect(requireFreshAuth()).resolves.toMatchObject({ user: { id: who.u.id } });
    await expect(requireFreshAuth()).rejects.toMatchObject({ code: "TOTP_REQUIRED" });
  });

  it("works through the requireFreshTotp wrapper the admin actions call, with an empty code", async () => {
    const who = await adminWithPasskey();
    await expect(stepUp(who, who.authenticator)).rejects.toMatchObject({ body: { code: "STEP_UP_OK" } });
    current.headers = who.headers;
    await expect(requireFreshTotp("")).resolves.toBeDefined();
  });

  it("is refused without a proof", async () => {
    const who = await adminWithPasskey();
    current.headers = who.headers;
    await expect(requireFreshTotp("")).rejects.toMatchObject({ code: "TOTP_REQUIRED" });
  });

  it("expires after 5 minutes", async () => {
    const who = await adminWithPasskey();
    await expect(stepUp(who, who.authenticator)).rejects.toMatchObject({ body: { code: "STEP_UP_OK" } });
    await db.update(freshAuth).set({ expiresAt: new Date(Date.now() - 1000) });
    current.headers = who.headers;
    await expect(requireFreshAuth()).rejects.toMatchObject({ code: "TOTP_REQUIRED" });
  });

  it("belongs to the session that made it, not to another session of the same user", async () => {
    const who = await adminWithPasskey();
    await expect(stepUp(who, who.authenticator)).rejects.toMatchObject({ body: { code: "STEP_UP_OK" } });
    current.headers = who.secondHeaders;
    await expect(requireFreshAuth()).rejects.toMatchObject({ code: "TOTP_REQUIRED" });
    current.headers = who.headers;
    await expect(requireFreshAuth()).resolves.toBeDefined();
  });

  it("refuses a passkey that belongs to someone else and grants nothing", async () => {
    const who = await adminWithPasskey();
    const stranger = createAuthenticator({ ...rp });
    const other = await seedPasswordUser();
    await db.insert(passkey).values({
      id: "pk-other",
      userId: other.id,
      credentialID: stranger.credentialId,
      publicKey: stranger.publicKeyBase64,
      counter: 0,
      deviceType: "singleDevice",
      backedUp: false,
      createdAt: new Date(),
    });
    await expect(stepUp(who, stranger)).rejects.toMatchObject({ body: { code: "PASSKEY_NOT_YOURS" } });
    expect(await db.select().from(freshAuth)).toHaveLength(0);
  });

  it("refuses an assertion without user verification and grants nothing", async () => {
    const who = await adminWithPasskey();
    await expect(stepUp(who, who.authenticator, { userVerified: false })).rejects.toMatchObject({ body: { code: "USER_VERIFICATION_REQUIRED" } });
    expect(await db.select().from(freshAuth)).toHaveLength(0);
  });

  it("needs a session: the header alone does not grant anything", async () => {
    const who = await adminWithPasskey();
    await expect(stepUp({ headers: new Headers(), setCookie: [] }, who.authenticator)).rejects.toMatchObject({ body: { code: "UNAUTHORIZED" } });
    expect(await db.select().from(freshAuth)).toHaveLength(0);
  });

  it("stores the counter the authenticator reports", async () => {
    const who = await adminWithPasskey();
    await expect(stepUp(who, who.authenticator)).rejects.toMatchObject({ body: { code: "STEP_UP_OK" } });
    expect((await db.select().from(passkey).where(eq(passkey.userId, who.u.id)))[0].counter).toBe(1);
  });
});
