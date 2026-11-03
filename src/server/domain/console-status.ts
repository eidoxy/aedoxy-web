import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { ensureConsoleAccount, NewApiError, setConsoleAccountEnabled } from "@/server/integrations/newapi";
import { bannedNowSql, isBannedNow } from "./ban-state";
import { errorCode, type BatchResult } from "./link-console-accounts";

export const STATUS_BATCH = 50;

/**
 * - in_sync: console already matches (nothing to do, or it was just pushed successfully)
 * - synced: pushed now
 * - no_account: user has no console account yet; the link task creates it and it starts enabled
 * - protected: console refused to disable an Admin/Root (HTTP 409); left out of sync on purpose so it stays visible
 * - pending: bridge failed; the worker retries
 */
export type SyncOutcome = { state: "in_sync" | "synced" | "no_account" | "protected" | "pending"; code?: string };

/**
 * Pushes the effective ban of one user to the console and records the pushed value in `console_disabled`.
 * Throws nothing for bridge failures: they come back as `pending` / `protected` so callers can keep going.
 * Idempotent and safe to run on several instances at once (the bridge call is idempotent).
 */
export async function syncConsoleAccountStatus(userId: string): Promise<SyncOutcome> {
  const [row] = await db.select().from(user).where(eq(user.id, userId)).limit(1);
  if (!row) return { state: "in_sync" };
  if (row.newapiUserId == null) return { state: "no_account" };

  const disable = isBannedNow(row);
  if (disable === row.consoleDisabled) return { state: "in_sync" };

  try {
    try {
      await setConsoleAccountEnabled(row.id, !disable);
    } catch (err) {
      if (!(err instanceof NewApiError) || err.status !== 404) throw err;
      // The console has no binding for this subject. Nothing to disable; an enable needs the account first.
      if (!disable && row.emailVerified) {
        const account = await ensureConsoleAccount({ subject: row.id, email: row.email, displayName: row.name, username: row.username ?? undefined });
        if (account.userId !== row.newapiUserId) await db.update(user).set({ newapiUserId: account.userId }).where(eq(user.id, row.id));
      }
    }
  } catch (err) {
    if (err instanceof NewApiError && err.status === 409) return { state: "protected", code: errorCode(err) };
    return { state: "pending", code: errorCode(err) };
  }

  await db.update(user).set({ consoleDisabled: disable }).where(eq(user.id, row.id));
  return { state: "synced" };
}

/** Worker task: retries every user whose console status differs from their effective ban (at most STATUS_BATCH per run). */
export async function syncConsoleStatuses(): Promise<BatchResult> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(isNotNull(user.newapiUserId), sql`${bannedNowSql()} <> ${user.consoleDisabled}`))
    .orderBy(asc(user.updatedAt))
    .limit(STATUS_BATCH);

  const result: BatchResult = { ok: 0, failed: 0, codes: {} };
  for (const { id } of rows) {
    try {
      const outcome = await syncConsoleAccountStatus(id);
      if (outcome.state === "pending" || outcome.state === "protected") {
        result.failed++;
        const code = `${outcome.state}:${outcome.code ?? "unknown"}`;
        result.codes[code] = (result.codes[code] ?? 0) + 1;
      } else result.ok++;
    } catch {
      // A database error for one user must not stop the others.
      result.failed++;
      result.codes.db = (result.codes.db ?? 0) + 1;
    }
  }
  if (rows.length > 0) console.log(`[worker] sync-console-status ok=${result.ok} failed=${result.failed} codes=${JSON.stringify(result.codes)}`);
  return result;
}
