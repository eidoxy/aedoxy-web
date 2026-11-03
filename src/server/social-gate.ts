import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { env } from "@/env";
import { isSocialProvider, SOCIAL_DISABLED_CODE, socialDisabledMessage, type SocialProvider } from "@/lib/social";
import { getSiteSettings } from "@/server/site";

/**
 * Server-side half of the admin's Google/GitHub switches (the other half is hiding the buttons). A provider that is switched off
 * cannot start a sign-in or sign-up (/sign-in/social), cannot be linked (/link-social) and cannot finish a round trip that was
 * started before the switch was turned off (/callback/:id). Unlinking is not touched. Providers that are on are not affected.
 *
 * The setting comes from the cached site-settings reader (saving expires its tag). If it cannot be read the answer is "on":
 * the credentials in env still decide whether the provider exists at all.
 */
const START_PATHS = new Set(["/sign-in/social", "/link-social"]);
const CALLBACK_PREFIX = "/callback/";

async function isSwitchedOff(provider: SocialProvider): Promise<boolean> {
  try {
    const s = await getSiteSettings();
    return !(provider === "google" ? s.googleLoginEnabled : s.githubLoginEnabled);
  } catch (err) {
    console.error(`[social] switch unreadable provider=${provider} reason=${err instanceof Error ? err.message : "unknown"}`);
    return false;
  }
}

export const socialGate = () =>
  ({
    id: "social-gate",
    hooks: {
      before: [
        {
          matcher: (ctx) => START_PATHS.has(ctx.path ?? "") || (ctx.path ?? "").startsWith(CALLBACK_PREFIX),
          handler: createAuthMiddleware(async (ctx) => {
            const isCallback = ctx.path.startsWith(CALLBACK_PREFIX);
            // ctx.path is the route pattern ("/callback/:id") here, so the provider id comes from the matched params.
            const provider: unknown = isCallback ? ctx.params?.id : (ctx.body as { provider?: unknown } | undefined)?.provider;
            if (!isSocialProvider(provider) || !(await isSwitchedOff(provider))) return;
            if (isCallback) {
              // The browser is mid-redirect from the provider: send it to the login page with a code that page can explain.
              throw ctx.redirect(new URL(`/login?error=${SOCIAL_DISABLED_CODE.toLowerCase()}_${provider}`, env.NEXT_PUBLIC_SITE_URL).toString());
            }
            throw APIError.from("FORBIDDEN", { message: socialDisabledMessage(provider), code: SOCIAL_DISABLED_CODE });
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;
