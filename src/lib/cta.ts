export type Cta = { label: string; href: string };

const DASHBOARD: Cta = { label: "Dashboard", href: "/dashboard" };

/** The anonymous call to action, or "Dashboard" once there is a session. Pending counts as anonymous so the first paint matches the static HTML. */
export function pickCta(signedIn: boolean, anonymous: Cta): Cta {
  return signedIn ? DASHBOARD : anonymous;
}
