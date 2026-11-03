import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { jwt } from "better-auth/plugins/jwt";
import { twoFactor } from "better-auth/plugins/two-factor";
import { env } from "@/env";
import { ensureConsoleAccountForUser } from "@/server/account";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { rejectUnverifiedOAuthEmail } from "@/server/oauth-email-guard";
import { PASSKEY_PATHS_CLOSED_OVER_HTTP, passkeyGate, passkeyPlugin } from "@/server/passkey-policy";
import { sessionOptions } from "@/server/session-config";
import { sessionTrust } from "@/server/session-trust-plugin";
import { getBrandName } from "@/server/site";

const isProd = env.NODE_ENV === "production";
const baseURL = env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_SITE_URL;

/** Best effort: a failed bridge call must never fail sign-up or verification. "Buka Console" retries it. */
async function linkConsoleAccount(userId: string) {
  try {
    await ensureConsoleAccountForUser(userId);
  } catch (err) {
    console.error(`[auth] console account link failed user=${userId} reason=${err instanceof Error ? err.message : "unknown"}`);
  }
}

/** Fire and forget so response timing does not reveal whether an email is registered (the brand lookup is part of the background work). */
function mail(to: string, compose: (brand: string) => { subject: string; text: string }) {
  void getBrandName()
    .then((brand) => sendEmail({ to, ...compose(brand) }))
    .catch((err: unknown) => {
      console.error(`[auth] email failed reason=${err instanceof Error ? err.message : "unknown"}`);
    });
}

export const auth = betterAuth({
  baseURL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.NEXT_PUBLIC_SITE_URL, env.NEWAPI_PUBLIC_URL],
  database: drizzleAdapter(db, { provider: "pg", schema }),

  // oauthProvider replaces the jwt plugin's /token endpoint (see the plugin docs).
  // The three /two-factor paths only need the password over HTTP; the admin security actions call the same
  // handlers through auth.api after also checking a fresh 2FA code, so the HTTP routes are closed (auth.api is unaffected).
  // Same for deleting or renaming a passkey: the admin security actions do it and write the audit row.
  disabledPaths: ["/token", "/two-factor/disable", "/two-factor/generate-backup-codes", "/two-factor/get-totp-uri", ...PASSKEY_PATHS_CLOSED_OVER_HTTP],

  user: {
    validateUserInfo: rejectUnverifiedOAuthEmail,
    additionalFields: {
      newapiUserId: { type: "number", required: false, unique: true, input: false },
      feedVisibility: { type: "string", required: false, defaultValue: "masked", input: false },
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 10,
    sendResetPassword: async ({ user, url }) => {
      mail(user.email, (brand) => ({
        subject: `Atur ulang kata sandi ${brand}`,
        text: `Buka tautan ini untuk mengatur ulang kata sandi ${brand} (berlaku 1 jam):\n${url}\n\nAbaikan email ini bila bukan Anda yang meminta.`,
      }));
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      mail(user.email, (brand) => ({ subject: `Verifikasi email ${brand}`, text: `Buka tautan ini untuk memverifikasi email Anda di ${brand}:\n${url}` }));
    },
    afterEmailVerification: async (user) => {
      await linkConsoleAccount(user.id);
    },
  },

  // Google sign-ups arrive with a verified email, so link them on creation.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          if (user.emailVerified) await linkConsoleAccount(user.id);
        },
      },
    },
  },

  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }),
    ...(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }),
  },

  // A social login joins the existing user with the same email. Better Auth still requires that user's email to be verified
  // (requireLocalEmailVerified defaults to true); the provider's own verified flag is enforced by validateUserInfo above.
  account: { accountLinking: { enabled: true, trustedProviders: ["google", "github"] } },

  session: sessionOptions,

  advanced: { useSecureCookies: isProd },

  // shortcut: in-memory counters are per process; move to storage "database" when running more than one instance.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
    },
  },

  plugins: [
    jwt(),
    oauthProvider({
      loginPage: "/login",
      // Required by the plugin's types; the console client skips consent, so this page is never reached.
      consentPage: "/consent",
      scopes: ["openid", "profile", "email"],
    }),
    twoFactor({ issuer: "Aedoxy" }),
    passkeyPlugin(baseURL),
    passkeyGate(),
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    sessionTrust(),
    nextCookies(), // keep last
  ],
});
