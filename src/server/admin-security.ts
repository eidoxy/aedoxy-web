import { db } from "@/server/db/client";
import { AdminError, writeAudit, type Actor } from "@/server/domain/audit";
import { createRateLimiter } from "@/server/rate-limit";
import { auth } from "@/server/auth";

/** Helpers for the account-security actions on /admin/security (2FA management, passkeys). */

// Counts every attempt (right or wrong) per user. shortcut: in-memory, see rate-limit.ts.
const allowPasswordAttempt = createRateLimiter({ windowMs: 5 * 60_000, max: 10 });

/** Re-checks the signed-in admin's own account password on the server. Throws AdminError when it fails. */
export async function confirmPassword(userId: string, password: string): Promise<void> {
  if (!allowPasswordAttempt(userId)) throw new AdminError("Terlalu banyak percobaan. Coba lagi dalam beberapa menit.", "RATE_LIMITED");
  if (!password) throw new AdminError("Masukkan kata sandi akun.", "PASSWORD_REQUIRED");
  const ctx = await auth.$context;
  const credential = await ctx.internalAdapter.findCredentialAccount(userId);
  if (!credential?.password) throw new AdminError("Akun ini tidak memakai kata sandi.", "NO_PASSWORD");
  if (!(await ctx.password.verify({ hash: credential.password, password }))) throw new AdminError("Kata sandi salah.", "INVALID_PASSWORD");
}

/** Audit row for a security action. Carries ids and counts only, never codes, secrets or tokens. */
export async function auditSecurity(actor: Actor, action: string, after?: unknown): Promise<void> {
  await db.transaction((tx) => writeAudit(tx, { actor, action, target: `user:${actor.id}`, after }));
}
