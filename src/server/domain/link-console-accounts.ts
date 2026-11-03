import { and, asc, eq, isNull, not } from "drizzle-orm";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { ensureConsoleAccountForUser } from "@/server/account";
import { NewApiError } from "@/server/integrations/newapi";
import { bannedNowSql } from "./ban-state";

export const LINK_BATCH = 20;

/** Short, secret-free label for a failure: the bridge error kind (and HTTP status), else "unknown". */
export function errorCode(err: unknown): string {
  if (err instanceof NewApiError) return err.status ? `${err.kind}:${err.status}` : err.kind;
  return "unknown";
}

export type BatchResult = { ok: number; failed: number; codes: Record<string, number> };

/**
 * Safety net for sign-ups whose best-effort bridge call failed: links verified, unbanned users that still have
 * no `newapi_user_id`, oldest first, at most LINK_BATCH per run. One failure does not stop the rest.
 * Safe next to other instances: the bridge is idempotent per subject and `newapi_user_id` is unique, so two
 * workers linking the same user write the same value.
 */
export async function linkConsoleAccounts(): Promise<BatchResult> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(eq(user.emailVerified, true), isNull(user.newapiUserId), not(bannedNowSql())))
    .orderBy(asc(user.createdAt))
    .limit(LINK_BATCH);

  const result: BatchResult = { ok: 0, failed: 0, codes: {} };
  for (const { id } of rows) {
    try {
      await ensureConsoleAccountForUser(id);
      result.ok++;
    } catch (err) {
      result.failed++;
      const code = errorCode(err);
      result.codes[code] = (result.codes[code] ?? 0) + 1;
    }
  }
  if (rows.length > 0) console.log(`[worker] link-console-accounts ok=${result.ok} failed=${result.failed} codes=${JSON.stringify(result.codes)}`);
  return result;
}
