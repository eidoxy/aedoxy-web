import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { usernameBase, usernameCandidate } from "@/lib/username";

export type ClaimOutcome = "assigned" | "taken" | "skip";

export const MAX_USERNAME_ATTEMPTS = 12;

/**
 * Tries base, base+2 digits, base+3 digits... until `attempt` reports "assigned". "taken" moves on to the next candidate, "skip"
 * stops (the user no longer needs a username). Returns the name that was stored, or null when every attempt was taken.
 * Pure over `attempt` so the retry rule can be unit tested without a database.
 */
export async function claimUsername(
  rawBase: string,
  attempt: (candidate: string) => Promise<ClaimOutcome>,
  random: () => number = Math.random,
): Promise<string | null> {
  const base = usernameBase(rawBase);
  for (let n = 0; n < MAX_USERNAME_ATTEMPTS; n++) {
    const candidate = usernameCandidate(base, n, random);
    const outcome = await attempt(candidate);
    if (outcome === "assigned") return candidate;
    if (outcome === "skip") return null;
  }
  return null;
}

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown; cause?: { code?: unknown } } | null);
  return code?.code === UNIQUE_VIOLATION || code?.cause?.code === UNIQUE_VIOLATION;
}

/**
 * Gives a user without a username one, based on a provider login or an email local part. The unique index decides who wins a
 * race: a losing write fails with 23505 and the next candidate is tried, so there is no check-then-write window.
 * Only fills a null username, so it never overwrites a name the user chose.
 */
export function assignGeneratedUsername(userId: string, rawBase: string) {
  return claimUsername(rawBase, async (candidate) => {
    try {
      const rows = await db
        .update(user)
        .set({ username: candidate, displayUsername: candidate })
        .where(and(eq(user.id, userId), isNull(user.username)))
        .returning({ id: user.id });
      return rows.length > 0 ? "assigned" : "skip";
    } catch (err) {
      if (isUniqueViolation(err)) return "taken";
      throw err;
    }
  });
}
