import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { freshAuth } from "@/server/db/schema";

/**
 * Single-use, short-lived proofs bound to one session row (table fresh_auth):
 *  - "action": the session just passed a passkey assertion; spent by the next sensitive admin action.
 *  - "passkey_register": the session just confirmed password + 2FA; allows adding ONE passkey.
 * Binding to the session id means another session (even the same user's) can never spend it, and
 * deleting the session deletes the proof.
 */
export type FreshPurpose = "action" | "passkey_register";

export const FRESH_AUTH_TTL_MS = 5 * 60_000;

/** Grants (or renews) the proof for this session and purpose. Also sweeps expired rows. */
export async function grantFreshAuth(sessionId: string, purpose: FreshPurpose, now = new Date()): Promise<void> {
  const expiresAt = new Date(now.getTime() + FRESH_AUTH_TTL_MS);
  await db.delete(freshAuth).where(lt(freshAuth.expiresAt, now));
  await db
    .insert(freshAuth)
    .values({ sessionId, purpose, expiresAt })
    .onConflictDoUpdate({ target: [freshAuth.sessionId, freshAuth.purpose], set: { expiresAt, createdAt: sql`now()` } });
}

/** Looks without spending. */
export async function hasFreshAuth(sessionId: string, purpose: FreshPurpose, now = new Date()): Promise<boolean> {
  const [row] = await db
    .select({ id: freshAuth.id })
    .from(freshAuth)
    .where(and(eq(freshAuth.sessionId, sessionId), eq(freshAuth.purpose, purpose), gt(freshAuth.expiresAt, now)))
    .limit(1);
  return Boolean(row);
}

/** Spends the proof. One DELETE ... RETURNING, so two concurrent requests cannot both succeed. */
export async function consumeFreshAuth(sessionId: string, purpose: FreshPurpose, now = new Date()): Promise<boolean> {
  const rows = await db
    .delete(freshAuth)
    .where(and(eq(freshAuth.sessionId, sessionId), eq(freshAuth.purpose, purpose), gt(freshAuth.expiresAt, now)))
    .returning({ id: freshAuth.id });
  return rows.length > 0;
}
