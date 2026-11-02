import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sensitiveSessionMiddleware } from "better-auth/api";
import { z } from "zod";
import { applySessionTrust } from "@/server/domain/session-trust";

/**
 * Server-only endpoint behind the "Percayai perangkat ini selama 30 hari" switch (auth.api.setSessionTrust).
 * It changes the CALLER's own session row and re-issues the session cookie with the matching Max-Age, using
 * Better Auth's own cookie name and attributes (so __Secure- in production is handled). It is separate from
 * the 2FA plugin's "trust device" and does not touch it.
 *
 * Turning it ON needs the account password when the account has one. Throttling lives in the caller
 * (settings action): Better Auth's rate limiter only sees HTTP requests, and this endpoint is never exposed over HTTP.
 */
export const sessionTrust = () =>
  ({
    id: "session-trust",
    endpoints: {
      setSessionTrust: createAuthEndpoint(
        "/session-trust/set",
        {
          method: "POST",
          body: z.object({ trusted: z.boolean(), password: z.string().max(128).optional() }),
          metadata: { scope: "server" },
          use: [sensitiveSessionMiddleware],
        },
        async (ctx) => {
          const { session, user } = ctx.context.session;
          const { trusted, password } = ctx.body;

          if (trusted) {
            const credential = await ctx.context.internalAdapter.findCredentialAccount(user.id);
            if (credential?.password) {
              const ok = password ? await ctx.context.password.verify({ hash: credential.password, password }) : false;
              if (!ok) {
                console.warn(`[session] trust refused user=${user.id} session=${session.id} reason=bad_password`);
                throw APIError.from("BAD_REQUEST", { message: "Invalid password", code: "INVALID_PASSWORD" });
              }
            }
          }

          const state = await applySessionTrust({ userId: user.id, sessionId: session.id, trusted });
          if (!state) throw APIError.from("UNAUTHORIZED", { message: "Unauthorized", code: "UNAUTHORIZED" });

          const maxAge = Math.max(1, Math.floor((state.expiresAt.getTime() - Date.now()) / 1000));
          const cookie = ctx.context.authCookies.sessionToken;
          await ctx.setSignedCookie(cookie.name, session.token, ctx.context.secret, { ...cookie.attributes, maxAge });

          console.info(`[session] trust ${trusted ? "on" : "off"} user=${user.id} session=${session.id} expires=${state.expiresAt.toISOString()}`);
          return ctx.json({ trusted: state.trustedAt !== null, expiresAt: state.expiresAt.toISOString() });
        },
      ),
    },
  }) satisfies BetterAuthPlugin;
