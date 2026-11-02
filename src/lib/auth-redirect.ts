type Params = Record<string, string | string[] | undefined>;

/** A same-site path ("/x?y=1"), or null. Rejects "//host", "/\host", absolute URLs and control characters (open redirect). */
export function safeInternalPath(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string" || v.length > 2048) return null;
  if (!v.startsWith("/") || v.startsWith("//") || v.includes("\\")) return null;
  if (/[\u0000-\u001f\u007f]/.test(v)) return null;
  return v;
}

/**
 * Where a visitor who is already signed in goes instead of /login, /register or /forgot-password:
 * a safe `callbackURL` or `next`, else /dashboard. Null means "stay": an OIDC request from the console
 * (its signed query carries `sig`) can come here on purpose, for a fresh login, and must keep the form.
 */
export function signedInDestination(params: Params): string | null {
  if (params.sig !== undefined) return null;
  return safeInternalPath(params.callbackURL) ?? safeInternalPath(params.next) ?? "/dashboard";
}
