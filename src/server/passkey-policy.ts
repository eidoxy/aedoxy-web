import { passkey } from "@better-auth/passkey";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { db } from "@/server/db/client";
import { consumeFreshAuth, hasFreshAuth } from "@/server/domain/fresh-auth";
import { writeAudit } from "@/server/domain/audit";

/**
 * Passkeys (WebAuthn) for Aedoxy. Rules, following the OWASP WebAuthn / Authentication cheat sheets:
 *  - The relying party id and the expected origin come from the configured site URL, never from request headers.
 *  - User verification is required, so a passkey sign-in is already two factors (possession + biometric/PIN)
 *    and does not ask for a TOTP code afterwards.
 *  - Discoverable credentials are required, so "Masuk dengan passkey" works without typing an email.
 *  - Adding a passkey is a credential change: it needs a fresh proof (password + 2FA code, see
 *    confirmPasskeyAddAction) that this session spends exactly once. Without it the HTTP routes answer 403,
 *    so a stolen session cookie cannot enrol an attacker's authenticator.
 */

/** WebAuthn ties a credential to a domain: `localhost` in dev, the real host in production. */
export function relyingPartyFor(baseUrl: string): { rpID: string; origin: string } {
  const url = new URL(baseUrl);
  return { rpID: url.hostname, origin: url.origin };
}

const REGISTER_OPTIONS = "/passkey/generate-register-options";
const REGISTER_VERIFY = "/passkey/verify-registration";

const forbidden = (code: string, message: string) => APIError.from("FORBIDDEN", { message, code });

function ipFrom(headers: Headers | undefined): string | null {
  const raw = headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || headers?.get("x-real-ip")?.trim() || null;
  return raw ? raw.slice(0, 64) : null;
}

export const PASSKEY_PATHS_CLOSED_OVER_HTTP = ["/passkey/delete-passkey", "/passkey/update-passkey"];

/** Gate for adding a passkey, plus throttling of the sign-in endpoints. */
const passkeyGate = () =>
  ({
    id: "passkey-gate",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === REGISTER_OPTIONS || ctx.path === REGISTER_VERIFY,
          handler: createAuthMiddleware(async (ctx) => {
            const current = await getSessionFromCtx(ctx);
            if (!current) throw APIError.from("UNAUTHORIZED", { message: "Unauthorized", code: "UNAUTHORIZED" });
            // Options are only looked at; the proof is spent when the credential is actually stored.
            const ok = ctx.path === REGISTER_VERIFY ? await consumeFreshAuth(current.session.id, "passkey_register") : await hasFreshAuth(current.session.id, "passkey_register");
            if (!ok) throw forbidden("PASSKEY_CONFIRMATION_REQUIRED", "Konfirmasi kata sandi dan kode 2FA diperlukan sebelum menambah passkey.");
          }),
        },
      ],
    },
    // shortcut: in-memory counters (see auth.ts rateLimit); move to storage "database" with more than one instance.
    rateLimit: [
      { pathMatcher: (path) => path === "/passkey/verify-authentication", window: 60, max: 10 },
      { pathMatcher: (path) => path === "/passkey/generate-authenticate-options", window: 60, max: 20 },
    ],
  }) satisfies BetterAuthPlugin;

const userVerificationRequired = () => APIError.from("UNAUTHORIZED", { message: "Passkey harus memakai verifikasi pengguna (biometrik atau PIN).", code: "USER_VERIFICATION_REQUIRED" });

export function passkeyPlugins(baseUrl: string) {
  return [
    passkey({
      rpName: "Aedoxy",
      ...relyingPartyFor(baseUrl),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      registration: {
        afterVerification: async ({ ctx, verification, user }) => {
          if (!verification.registrationInfo?.userVerified) throw userVerificationRequired();
          const { credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
          await db.transaction((tx) =>
            writeAudit(tx, {
              actor: { id: user.id, ip: ipFrom(ctx.headers) },
              action: "admin.passkey.add",
              target: `user:${user.id}`,
              after: { deviceType: credentialDeviceType, backedUp: credentialBackedUp },
            }),
          );
        },
      },
      authentication: {
        afterVerification: async ({ verification }) => {
          if (!verification.authenticationInfo.userVerified) throw userVerificationRequired();
        },
      },
    }),
    passkeyGate(),
  ];
}
