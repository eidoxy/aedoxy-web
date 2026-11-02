import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { account } from "@/server/db/schema";
import { seedUser } from "./helpers";

/** A verified user with an email+password credential, like a normal sign-up. Test constants, not secrets. */
export const TEST_PASSWORD = "correct-horse-battery";

export async function seedPasswordUser(withPassword = true) {
  const u = await seedUser();
  if (withPassword) {
    await db.insert(account).values({
      id: randomUUID(),
      accountId: u.id,
      providerId: "credential",
      userId: u.id,
      password: await hashPassword(TEST_PASSWORD),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  return u;
}

/** Signs in through the real Better Auth API. Returns the Set-Cookie lines and the `cookie` request header to replay. */
export async function signIn(email: string) {
  const { headers } = await auth.api.signInEmail({ body: { email, password: TEST_PASSWORD }, headers: new Headers(), returnHeaders: true });
  const setCookie = headers.getSetCookie();
  const sessionCookie = setCookie.find((c) => c.startsWith("better-auth.session_token="));
  if (!sessionCookie) throw new Error("sign-in did not set a session cookie");
  return { setCookie, sessionCookie, requestHeaders: new Headers({ cookie: sessionCookie.split(";")[0] }) };
}

/** Reads one attribute (e.g. Max-Age) of a Set-Cookie line. */
export function cookieAttr(line: string, name: string) {
  const hit = line.split(";").map((p) => p.trim().split("=")).find(([k]) => k.toLowerCase() === name.toLowerCase());
  return hit ? (hit[1] ?? "") : undefined;
}
