import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { session, user } from "@/server/db/schema";
import { writeAudit } from "./audit";
import { syncConsoleAccountStatus } from "./console-status";

/**
 * Operator ban / unban, reachable only from scripts/ban-user.ts and scripts/unban-user.ts (shell access), never over HTTP.
 * The database change, the session revocation (ban only) and the audit row share one transaction. The console is
 * pushed afterwards, once: a bridge failure does not undo the ban, the `sync-console-status` worker task catches up.
 * Returns null when no user has that email (matched case-insensitively).
 */
export type BanResult = {
  id: string;
  email: string;
  changed: boolean;
  sessionsRevoked: number;
  /** disabled / enabled: the console matches now. pending: bridge failed, the worker retries. none: the user has no console account yet. */
  console: "disabled" | "enabled" | "pending" | "none";
};

const REASON_MAX = 200;

async function setBan(email: string, ban: boolean, reason?: string): Promise<BanResult | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) throw new RangeError("email is required");
  const cleanReason = ban ? reason?.trim().slice(0, REASON_MAX) || null : null;

  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: user.id, email: user.email, banned: user.banned, banReason: user.banReason })
      .from(user)
      .where(sql`lower(${user.email}) = ${wanted}`)
      .for("update");
    if (!row) return null;

    await tx.update(user).set({ banned: ban, banReason: cleanReason, banExpires: null, updatedAt: new Date() }).where(eq(user.id, row.id));
    const revoked = ban ? await tx.delete(session).where(eq(session.userId, row.id)).returning({ id: session.id }) : [];
    await writeAudit(tx, {
      actor: { id: ban ? "cli:ban-user" : "cli:unban-user", ip: null },
      action: ban ? "user.ban" : "user.unban",
      target: `user:${row.id}`,
      before: { banned: row.banned === true, banReason: row.banReason },
      after: { banned: ban, banReason: cleanReason, sessionsRevoked: revoked.length },
    });
    return { id: row.id, email: row.email, changed: (row.banned === true) !== ban, sessionsRevoked: revoked.length };
  });
  if (!done) return null;

  let outcome: Awaited<ReturnType<typeof syncConsoleAccountStatus>>["state"];
  try {
    outcome = (await syncConsoleAccountStatus(done.id)).state;
  } catch {
    outcome = "pending";
  }
  const console_ = outcome === "no_account" ? "none" : outcome === "in_sync" || outcome === "synced" ? (ban ? "disabled" : "enabled") : "pending";
  return { ...done, console: console_ };
}

export const banUser = (email: string, reason?: string) => setBan(email, true, reason);
export const unbanUser = (email: string) => setBan(email, false);
