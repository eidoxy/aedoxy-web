import { adminNavFor } from "./admin-nav";
import type { NavGroup } from "./nav";
import { userNav } from "./user-nav";

export type ConsoleVariant = "user" | "admin";

/** Menu for a role. `has2fa` only matters for admins. */
export function navFor(variant: ConsoleVariant, has2fa: boolean): NavGroup[] {
  return variant === "admin" ? adminNavFor(has2fa) : userNav;
}
