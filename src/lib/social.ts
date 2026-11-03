/** Social sign-in providers the app knows. Pure: safe for client components (which env decides is server-only, see server/social-providers.ts). */

export const SOCIAL_PROVIDERS = ["google", "github"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const SOCIAL_LABEL: Record<SocialProvider, string> = { google: "Google", github: "GitHub" };

export const isSocialProvider = (v: unknown): v is SocialProvider => SOCIAL_PROVIDERS.some((p) => p === v);

/** Error code the server answers with (and puts in `?error=` for a callback) when the admin switched a provider off. */
export const SOCIAL_DISABLED_CODE = "SOCIAL_LOGIN_DISABLED";

export const socialDisabledMessage = (p: SocialProvider) => `Login dengan ${SOCIAL_LABEL[p]} sedang dinonaktifkan.`;
