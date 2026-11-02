/** Session lifetime: an absolute 24 hours from sign-in, never extended by use. */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

export const sessionOptions = {
  expiresIn: SESSION_TTL_SECONDS,
  // Without this Better Auth pushes expires_at forward on every read after `updateAge`.
  disableSessionRefresh: true,
} as const;
