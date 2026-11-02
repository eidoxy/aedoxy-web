/** Session lifetime: an absolute 24 hours from sign-in, never extended by use. */
export const SESSION_TTL_SECONDS = 24 * 60 * 60;

export const sessionOptions = {
  expiresIn: SESSION_TTL_SECONDS,
  // Without this Better Auth pushes expires_at forward on every read after `updateAge`.
  disableSessionRefresh: true,
  additionalFields: {
    /** Set while the 30 day "trust this device" window is on (column trusted_at). */
    trustedAt: { type: "date", required: false, input: false },
  },
} as const;
