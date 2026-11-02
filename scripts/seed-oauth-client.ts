/**
 * Registers the first-party OIDC client the New API console logs in with.
 * Idempotent: does nothing when the client already exists.
 *
 * Run: bun scripts/seed-oauth-client.ts   (Bun loads .env.local itself)
 *
 * Prints only the client id. A newly generated secret is written to
 * .env.local as CONSOLE_OIDC_CLIENT_SECRET and not printed. In production (NODE_ENV=production)
 * it is printed once to stdout instead; SEED_OAUTH_OUT=<path> or SEED_OAUTH_OUT=- overrides either default.
 */
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { env } from "@/env";
import { db, pool } from "@/server/db/client";
import { oauthClient } from "@/server/db/schema";

const ENV_FILE = resolve(process.cwd(), ".env.local");
const KEY = "CONSOLE_OIDC_CLIENT_SECRET";

// Where the new secret goes. Dev default: .env.local. SEED_OAUTH_OUT=<path> writes there instead,
// SEED_OAUTH_OUT=- prints it to stdout (the production default: a container has no persistent .env.local).
const OUT = process.env.SEED_OAUTH_OUT ?? (process.env.NODE_ENV === "production" ? "-" : ENV_FILE);

function storeSecret(secret: string) {
  const line = `${KEY}=${secret}`;
  if (OUT === "-") {
    console.log(line);
    return;
  }
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  const pattern = new RegExp(`^${KEY}=.*$`, "m");
  if (pattern.test(current)) {
    // Function replacer: a secret containing "$" must not be read as a replacement pattern.
    writeFileSync(OUT, current.replace(pattern, () => line));
  } else {
    appendFileSync(OUT, `${current && !current.endsWith("\n") ? "\n" : ""}${line}\n`);
  }
}

async function main() {
  const clientId = env.CONSOLE_OIDC_CLIENT_ID;
  const [existing] = await db.select({ id: oauthClient.id }).from(oauthClient).where(eq(oauthClient.clientId, clientId)).limit(1);
  if (existing) {
    console.log(`client_id=${clientId} already exists, nothing changed.`);
    if (!env.CONSOLE_OIDC_CLIENT_SECRET) {
      console.log(`${KEY} is empty in .env.local. The secret is stored hashed, so rotate it to get a new one.`);
    }
    return;
  }

  const redirectUri = `${env.NEWAPI_PUBLIC_URL.replace(/\/+$/, "")}/oauth/aedoxy`;
  // The admin API (auth.api.adminCreateOAuthClient) needs a signed-in session and generates a random
  // client id, so the row is inserted directly. The secret is stored the way the plugin's default
  // "hashed" mode does: SHA-256, base64url without padding (@better-auth/oauth-provider defaultHasher).
  const secret = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.insert(oauthClient).values({
    id: randomUUID(),
    clientId,
    clientSecret: createHash("sha256").update(secret).digest("base64url"),
    name: "Aedoxy Console",
    redirectUris: [redirectUri],
    scopes: ["openid", "profile", "email"],
    grantTypes: ["authorization_code"],
    responseTypes: ["code"],
    tokenEndpointAuthMethod: "client_secret_post",
    applicationType: "web",
    skipConsent: true,
    // New API's generic OAuth client does not send PKCE.
    requirePKCE: false,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  });
  storeSecret(secret);
  console.log(`client_id=${clientId} created. redirect_uri=${redirectUri}`);
  if (OUT !== "-") console.log(`Secret written to ${OUT} as ${KEY} (not printed).`);
}

main()
  .catch((err: unknown) => {
    console.error(`seed failed: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
