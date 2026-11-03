/**
 * Username rules, shared by the sign-up form (client) and the Better Auth username plugin (server). Pure: no server imports.
 * The 20 character cap comes from New API, which limits its own usernames to 20.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin", "administrator", "root", "support", "system", "aedoxy", "api", "www", "null", "undefined", "console", "billing", "security", "help",
]);

const FORMAT = /^[a-z0-9_]+$/;

export type UsernameProblem = "length" | "format" | "reserved";

/** Checks an already lowercased username. Returns the first problem, or null when it is acceptable. */
export function usernameProblem(username: string): UsernameProblem | null {
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) return "length";
  if (!FORMAT.test(username)) return "format";
  if (RESERVED_USERNAMES.has(username)) return "reserved";
  return null;
}

export const isValidUsername = (username: string) => usernameProblem(username) === null;

/**
 * Turns a provider login or the local part of an email into a valid username base: strips accents, lowercases, keeps `a-z0-9_`,
 * cuts to 20, and pads or renames what is too short or reserved. Always returns something `isValidUsername` accepts.
 */
export function usernameBase(raw: string): string {
  const cleaned = raw
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, USERNAME_MAX);
  if (cleaned === "") return "user";
  if (cleaned.length < USERNAME_MIN || RESERVED_USERNAMES.has(cleaned)) return `${cleaned}_user`;
  return cleaned;
}

/**
 * The attempt-th candidate for a base: the base itself first, then the base with a random numeric suffix that grows by one digit
 * per attempt (2 digits, 3 digits, ... up to 6) so a crowded base still finds a free name. Always valid and at most 20 characters.
 */
export function usernameCandidate(base: string, attempt: number, random: () => number = Math.random): string {
  if (attempt <= 0) return base;
  const digits = Math.min(attempt + 1, 6);
  const suffix = String(Math.floor(random() * 10 ** digits)).padStart(digits, "0");
  return base.slice(0, USERNAME_MAX - digits) + suffix;
}
