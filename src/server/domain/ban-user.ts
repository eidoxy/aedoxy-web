import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { session, user } from "@/server/db/schema";
import { writeAudit, type Actor } from "./audit";
import { syncConsoleAccountStatus } from "./console-status";

/**
 * Ban / unban, shared by the operator scripts (scripts/ban-user.ts, scripts/unban-user.ts: by email, actor "cli:...")
 * and the admin users page (by id, actor = the signed-in admin). The database change, the session revocation (ban only)
 * and the audit row share one transaction. The console is pushed afterwards, once: a bridge failure does not undo the
 * ban, the `sync-console-status` worker task catches up.
 * Returns null when no user matches (an email is matched case-insensitively).
 */
export type BanResult = {
  id: string;
  email: string;
  changed: boolean;
  sessionsRevoked: number;
  /**
   * disabled / enabled: the console matches now. pending: bridge failed, the worker retries. none: the user has no console account yet.
   * protected: the console refused (409, an Admin/Root there); stays out of sync until the role is lowered in the console.
   */
  console: "disabled" | "enabled" | "pending" | "none" | "protected";
};

export const BAN_REASON_MAX = 200;

type Target = { email: string } | { id: string };
type Options = { actor: Actor; reason?: string; expiresAt?: Date | null };

async function setBan(target: Target, ban: boolean, { actor, reason, expiresAt }: Options): Promise<BanResult | null> {
  let where: SQL;
  if ("email" in target) {
    const wanted = target.email.trim().toLowerCase();
    if (!wanted) throw new RangeError("email is required");
    where = sql`lower(${user.email}) = ${wanted}`;
  } else {
    where = eq(user.id, target.id);
  }
  const cleanReason = ban ? reason?.trim().slice(0, BAN_REASON_MAX) || null : null;
  const cleanExpires = ban ? (expiresAt ?? null) : null;

  const done = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: user.id, email: user.email, banned: user.banned, banReason: user.banReason, banExpires: user.banExpires })
      .from(user)
      .where(where)
      .for("update");
    if (!row) return null;

    await tx.update(user).set({ banned: ban, banReason: cleanReason, banExpires: cleanExpires, updatedAt: new Date() }).where(eq(user.id, row.id));
    const revoked = ban ? await tx.delete(session).where(eq(session.userId, row.id)).returning({ id: session.id }) : [];
    await writeAudit(tx, {
      actor,
      action: ban ? "user.ban" : "user.unban",
      target: `user:${row.id}`,
      before: { banned: row.banned === true, banReason: row.banReason, banExpires: row.banExpires },
      after: { banned: ban, banReason: cleanReason, banExpires: cleanExpires, sessionsRevoked: revoked.length },
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
  const console_: BanResult["console"] =
    outcome === "no_account" ? "none" : outcome === "in_sync" || outcome === "synced" ? (ban ? "disabled" : "enabled") : outcome === "protected" ? "protected" : "pending";
  return { ...done, console: console_ };
}

const cli = (name: string): Actor => ({ id: `cli:${name}`, ip: null });

export const banUser = (email: string, reason?: string) => setBan({ email }, true, { actor: cli("ban-user"), reason });
export const unbanUser = (email: string) => setBan({ email }, false, { actor: cli("unban-user") });
export const banUserById = (id: string, opts: Options) => setBan({ id }, true, opts);
export const unbanUserById = (id: string, actor: Actor) => setBan({ id }, false, { actor });
