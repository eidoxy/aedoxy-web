import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { session, twoFactor, user } from "@/server/db/schema";
import { writeAudit } from "./audit";

/**
 * Emergency recovery for an admin who lost both the authenticator and the backup codes.
 * Reachable only from scripts/reset-2fa.ts (shell access to the server), never from an HTTP endpoint.
 * One transaction: drop the 2FA secret, switch 2FA off, revoke EVERY session (a stolen session must not
 * survive the reset), and audit. The audit row carries ids and counts only, never secrets. Idempotent.
 * Returns null when no user has that email. Emails are matched case-insensitively.
 */
export async function reset2fa(email: string): Promise<{ id: string; email: string; hadTwoFactor: boolean; sessionsRevoked: number } | null> {
  const wanted = email.trim().toLowerCase();
  if (!wanted) throw new RangeError("email is required");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: user.id, email: user.email, twoFactorEnabled: user.twoFactorEnabled })
      .from(user)
      .where(sql`lower(${user.email}) = ${wanted}`)
      .for("update");
    if (!row) return null;

    const removed = await tx.delete(twoFactor).where(eq(twoFactor.userId, row.id)).returning({ id: twoFactor.id });
    await tx.update(user).set({ twoFactorEnabled: false, updatedAt: new Date() }).where(eq(user.id, row.id));
    const revoked = await tx.delete(session).where(eq(session.userId, row.id)).returning({ id: session.id });

    await writeAudit(tx, {
      actor: { id: "cli:reset-2fa", ip: null },
      action: "user.reset_2fa",
      target: `user:${row.id}`,
      before: { twoFactorEnabled: row.twoFactorEnabled === true, twoFactorRows: removed.length },
      after: { twoFactorEnabled: false, sessionsRevoked: revoked.length },
    });
    return { id: row.id, email: row.email, hadTwoFactor: row.twoFactorEnabled === true || removed.length > 0, sessionsRevoked: revoked.length };
  });
}
