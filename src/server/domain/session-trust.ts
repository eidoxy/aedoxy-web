import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { account, session } from "@/server/db/schema";
import { SESSION_TTL_SECONDS } from "@/server/session-config";

/** "Percayai perangkat ini selama 30 hari": lifetime rules for one session row. */

export const TRUSTED_TTL_SECONDS = 30 * 24 * 60 * 60;

export type TrustState = { expiresAt: Date; trustedAt: Date | null };

/**
 * ON: expiry becomes `now + 30 days` (absolute, never later) and the session is marked trusted.
 * Already trusted: unchanged, so repeating the request cannot stretch the window past 30 days from the first grant.
 * OFF: trust is cleared and expiry drops to at most 24 hours from now (never later than it already was).
 */
export function nextTrustState(trusted: boolean, current: TrustState, now: Date): TrustState {
  if (trusted) {
    if (current.trustedAt) return current;
    return { expiresAt: new Date(now.getTime() + TRUSTED_TTL_SECONDS * 1000), trustedAt: now };
  }
  const cap = now.getTime() + SESSION_TTL_SECONDS * 1000;
  return { expiresAt: new Date(Math.min(current.expiresAt.getTime(), cap)), trustedAt: null };
}

/**
 * Applies the rule to the caller's own session row (matched on id AND user id, so no other session can change).
 * Returns null when the session does not exist, belongs to someone else, or has already expired.
 */
export async function applySessionTrust(input: { userId: string; sessionId: string; trusted: boolean; now?: Date }): Promise<TrustState | null> {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ expiresAt: session.expiresAt, trustedAt: session.trustedAt })
      .from(session)
      .where(and(eq(session.id, input.sessionId), eq(session.userId, input.userId)))
      .for("update");
    if (!row || row.expiresAt.getTime() <= now.getTime()) return null;
    const next = nextTrustState(input.trusted, row, now);
    if (next !== row) await tx.update(session).set(next).where(eq(session.id, input.sessionId));
    return next;
  });
}

/** True when the user signs in with a password (Google-only accounts have none and skip the password confirmation). */
export async function hasPasswordLogin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential"), isNotNull(account.password)))
    .limit(1);
  return Boolean(row);
}
