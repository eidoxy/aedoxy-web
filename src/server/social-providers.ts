import { env } from "@/env";
import type { SiteSettings } from "@/lib/schemas/site";
import type { SocialProvider } from "@/lib/social";
import { getSiteSettings } from "@/server/site";

type CredentialEnv = Pick<typeof env, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET">;
type Switches = Pick<SiteSettings, "googleLoginEnabled" | "githubLoginEnabled">;

/** Providers whose credentials are set on the server (env.ts guarantees id and secret come as a pair). */
export function configuredSocialProviders(e: CredentialEnv = env): SocialProvider[] {
  const out: SocialProvider[] = [];
  if (e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET) out.push("google");
  if (e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET) out.push("github");
  return out;
}

/** Configured in env AND switched on by the admin. */
export function effectiveSocialProviders(configured: SocialProvider[], s: Switches): SocialProvider[] {
  return configured.filter((p) => (p === "google" ? s.googleLoginEnabled : s.githubLoginEnabled));
}

/** What the login page, the register page and the linked-accounts card offer. Reads the cached site settings (never throws: they fall back to the defaults). */
export async function getSocialProviders(): Promise<SocialProvider[]> {
  return effectiveSocialProviders(configuredSocialProviders(), await getSiteSettings());
}
