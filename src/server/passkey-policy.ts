import { passkey } from "@better-auth/passkey";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { clientIp } from "@/server/client-ip";
import { db } from "@/server/db/client";
import { consumeFreshAuth, grantFreshAuth, hasFreshAuth } from "@/server/domain/fresh-auth";
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

/** Sent by the "Gunakan passkey" button next to a 2FA field; see the step-up branch below. */
export const STEP_UP_HEADER = "x-aedoxy-step-up";

export const PASSKEY_PATHS_CLOSED_OVER_HTTP = ["/passkey/delete-passkey", "/passkey/update-passkey"];

/** Gate for adding a passkey, plus throttling of the sign-in endpoints. */
export const passkeyGate = () =>
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
    // Counted in the database like the rest of auth.ts rateLimit.
    rateLimit: [
      { pathMatcher: (path) => path === "/passkey/verify-authentication", window: 60, max: 10 },
      { pathMatcher: (path) => path === "/passkey/generate-authenticate-options", window: 60, max: 20 },
    ],
  }) satisfies BetterAuthPlugin;

const userVerificationRequired = () => APIError.from("UNAUTHORIZED", { message: "Passkey harus memakai verifikasi pengguna (biometrik atau PIN).", code: "USER_VERIFICATION_REQUIRED" });

// Two separate exports (not one array): spreading an array into `plugins` widens the inferred plugin tuple and
// drops the admin plugin's `role` from the session type.
export function passkeyPlugin(baseUrl: string) {
  return passkey({
      rpName: "Aedoxy",
      ...relyingPartyFor(baseUrl),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      registration: {
        afterVerification: async ({ ctx, verification, user }) => {
          if (!verification.registrationInfo?.userVerified) throw userVerificationRequired();
          const { credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
          await db.transaction((tx) =>
            writeAudit(tx, {
              actor: { id: user.id, ip: ctx.headers ? clientIp(ctx.headers) : null },
              action: "admin.passkey.add",
              target: `user:${user.id}`,
              after: { deviceType: credentialDeviceType, backedUp: credentialBackedUp },
            }),
          );
        },
      },
      authentication: {
        afterVerification: async ({ ctx, verification }) => {
          const info = verification.authenticationInfo;
          if (!info.userVerified) throw userVerificationRequired();
          if (ctx.headers?.get(STEP_UP_HEADER) !== "1") return; // normal sign-in

          // Step-up: prove a sensitive action with a passkey, without a new session. The credential must belong to
          // the user of the CURRENT session. We store the proof on that session and abort before the plugin would
          // sign anybody in (the status is 200, so the client sees success).
          const current = await getSessionFromCtx(ctx);
          if (!current) throw APIError.from("UNAUTHORIZED", { message: "Unauthorized", code: "UNAUTHORIZED" });
          const owned = await ctx.context.adapter.findOne<{ id: string; userId: string }>({ model: "passkey", where: [{ field: "credentialID", value: info.credentialID }] });
          if (!owned || owned.userId !== current.user.id) throw forbidden("PASSKEY_NOT_YOURS", "Passkey ini bukan milik akun yang sedang masuk.");
          await ctx.context.adapter.update({ model: "passkey", where: [{ field: "id", value: owned.id }], update: { counter: info.newCounter } });
          await grantFreshAuth(current.session.id, "action");
          throw APIError.from("OK", { message: "Passkey terverifikasi.", code: "STEP_UP_OK" });
        },
      },
  });
}
