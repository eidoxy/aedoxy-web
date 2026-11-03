import { sql } from "drizzle-orm";
import { user } from "@/server/db/schema";

/**
 * The one definition of "banned right now": `banned` is set and the ban has no end or the end is still ahead.
 * Better Auth's admin plugin leaves `banned = true` after `ban_expires` passes, so the flag alone is not enough.
 * `banned` is nullable, hence the coalesce (a NULL here would make `not(...)` filter out every row).
 * `ban_expires` is `timestamp` without time zone and drizzle writes it as the UTC ISO string, so `now` is bound the same way
 * (a raw Date param would be sent in local time, and a SQL now() depends on the session time zone).
 * A deleted account (`deleted_at` set) is banned for ever, whatever the ban columns say.
 */
export function bannedNowSql(now: Date = new Date()) {
  return sql`(${user.deletedAt} is not null or (coalesce(${user.banned}, false) = true and (${user.banExpires} is null or ${user.banExpires} > ${now.toISOString()}::timestamp)))`;
}

/** Same rule for a row already in memory. */
export function isBannedNow(row: { banned: boolean | null; banExpires: Date | null; deletedAt?: Date | null }, now: Date = new Date()): boolean {
  if (row.deletedAt != null) return true;
  return row.banned === true && (row.banExpires == null || row.banExpires.getTime() > now.getTime());
}
