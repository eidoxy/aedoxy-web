import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { session, twoFactor, user } from "@/server/db/schema";
import { writeAudit, type Actor } from "./audit";

/**
 * Emergency recovery for an admin who lost both the authenticator and the backup codes.
 * `reset2fa` is reachable only from scripts/reset-2fa.ts (shell access to the server); `reset2faById` only from the admin users action, behind fresh admin proof.
 * One transaction: drop the 2FA secret, switch 2FA off, revoke EVERY session (a stolen session must not
 * survive the reset), and audit. The audit row carries ids and counts only, never secrets. Idempotent.
 * Returns null when no user has that email. Emails are matched case-insensitively.
 * `reset2faById` is the same change for the admin users page (actor = the signed-in admin, audit action user.2fa.reset).
 */
export type Reset2faResult = { id: string; email: string; hadTwoFactor: boolean; sessionsRevoked: number };

export async function reset2fa(email: string): Promise<Reset2faResult | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) throw new RangeError("email is required");
  return run(sql`lower(${user.email}) = ${wanted}`, { id: "cli:reset-2fa", ip: null }, "user.reset_2fa");
}

export const reset2faById = (id: string, actor: Actor) => run(eq(user.id, id), actor, "user.2fa.reset");

async function run(where: SQL, actor: Actor, action: string): Promise<Reset2faResult | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: user.id, email: user.email, twoFactorEnabled: user.twoFactorEnabled })
      .from(user)
      .where(where)
      .for("update");
    if (!row) return null;

    const removed = await tx.delete(twoFactor).where(eq(twoFactor.userId, row.id)).returning({ id: twoFactor.id });
    await tx.update(user).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(user.id, row.id));
    const revoked = await tx.delete(session).where(eq(session.userId, row.id)).returning({ id: session.id });

    await writeAudit(tx, {
      actor,
      action,
      target: `user:${row.id}`,
      before: { twoFactorEnabled: row.twoFactorEnabled === true, twoFactorRows: removed.length },
      after: { twoFactorEnabled: false, sessionsRevoked: revoked.length },
    });
    return { id: row.id, email: row.email, hadTwoFactor: row.twoFactorEnabled === true || removed.length > 0, sessionsRevoked: revoked.length };
  });
}
