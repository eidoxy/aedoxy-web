import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";

/**
 * Shared limiter on Postgres (table rate_limits), so counters survive restarts and are shared by every web instance.
 * Fixed window, not sliding: one atomic upsert per hit and no per-request history; a client can burst up to 2x `max`
 * across a window boundary, which is acceptable for these limits.
 * The clock is the database's now(), never the process clock. Keys are namespaced by the caller
 * (`orders:create:<userId>`); keys longer than MAX_KEY are replaced by a SHA-256 so nothing unbounded or raw is stored.
 */

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterMs: number };

const MAX_KEY = 128;

function storedKey(key: string): string {
  if (key.length <= MAX_KEY) return key;
  const colon = key.indexOf(":");
  const namespace = colon > 0 ? key.slice(0, Math.min(colon, 32)) : "key";
  return `${namespace}:sha256:${createHash("sha256").update(key).digest("hex")}`;
}

type Hit = { key: string; windowMs: number; max: number; /** Store unavailable: true = allow (public, low-risk), false = refuse (security paths). */ failOpen: boolean };

/** Counts one hit. Allowed while the count in the current window is <= max. */
export async function hitRateLimit({ key, windowMs, max, failOpen }: Hit): Promise<RateLimitResult> {
  try {
    // count is capped at max + 1 so a flood cannot overflow the integer column.
    const { rows } = await db.execute<{ count: number; retry_ms: number }>(sql`
      INSERT INTO rate_limits AS r (key, count, reset_at)
      VALUES (${storedKey(key)}, 1, now() + ${windowMs} * interval '1 millisecond')
      ON CONFLICT (key) DO UPDATE SET
        count = CASE WHEN r.reset_at <= now() THEN 1 ELSE LEAST(r.count + 1, ${max + 1}) END,
        reset_at = CASE WHEN r.reset_at <= now() THEN now() + ${windowMs} * interval '1 millisecond' ELSE r.reset_at END
      RETURNING count, (extract(epoch FROM (reset_at - now())) * 1000)::int AS retry_ms
    `);
    const { count, retry_ms } = rows[0];
    const allowed = count <= max;
    return { allowed, remaining: Math.max(0, max - count), retryAfterMs: allowed ? 0 : Math.max(0, retry_ms) };
  } catch (err) {
    // The key is not logged: it can carry a user id or an address.
    console.error(`[rate-limit] store unavailable failOpen=${failOpen} reason=${err instanceof Error ? err.message : "unknown"}`);
    return failOpen ? { allowed: true, remaining: 0, retryAfterMs: 0 } : { allowed: false, remaining: 0, retryAfterMs: windowMs };
  }
}

/** Forgets a key, for "count only failures" flows once the attempt succeeds. Failing to reset is harmless (the window ends by itself). */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await db.execute(sql`DELETE FROM rate_limits WHERE key = ${storedKey(key)}`);
  } catch (err) {
    console.error(`[rate-limit] reset failed reason=${err instanceof Error ? err.message : "unknown"}`);
  }
}

/** Worker task: deletes counters that ended more than an hour ago, at most `limit` rows per call. Returns the number deleted. */
export async function deleteExpiredRateLimits(limit = 5_000): Promise<number> {
  const res = await db.execute(sql`
    DELETE FROM rate_limits WHERE key IN (
      SELECT key FROM rate_limits WHERE reset_at < now() - interval '1 hour' LIMIT ${limit}
    )
  `);
  // Better Auth prunes its own table only when a key's window rolls over, so one-off keys would stay for ever.
  const auth = await db.execute(sql`
    DELETE FROM rate_limit WHERE id IN (
      SELECT id FROM rate_limit WHERE last_request < (extract(epoch FROM now()) * 1000)::bigint - 3600000 LIMIT ${limit}
    )
  `);
  return (res.rowCount ?? 0) + (auth.rowCount ?? 0);
}
