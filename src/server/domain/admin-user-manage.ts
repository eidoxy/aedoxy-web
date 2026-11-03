import { randomUUID } from "node:crypto";
import { and, count, eq, or, sql } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { db } from "@/server/db/client";
import {
  account,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  orders,
  passkey,
  session,
  twoFactor,
  user,
  verification,
} from "@/server/db/schema";
import { sendEmail } from "@/server/email";
import { getBrandName } from "@/server/site";
import { AdminError, writeAudit, type Actor } from "./audit";
import { syncConsoleAccountStatus } from "./console-status";
import { reset2faById } from "./reset-2fa";
import { getActivePlanForUser } from "./user-plan";

/**
 * Account management for /admin/users/[id]: display name, password, 2FA reset, passkey reset, delete (tombstone).
 * Every function refuses the admin's own account and a deleted account. Password, 2FA and passkey changes are
 * credential changes: the caller (the server action) has already checked fresh admin proof. Audit rows carry ids,
 * counts and flags only, never a name, email or password.
 */

export const NAME_MIN = 2;
export const NAME_MAX = 80;
/** Same bounds as `minPasswordLength` in src/server/auth.ts and PASSWORD_MIN in src/lib/schemas/auth.ts; 128 is the sign-in form's cap. */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

const DELETED_NAME = "Pengguna dihapus";
const DELETED_REASON = "Akun dihapus";

type Row = { id: string; email: string; role: string | null; username: string | null; twoFactorEnabled: boolean | null; deletedAt: Date | null };

/** Loads (and locks, inside a transaction) the target and applies the checks every action shares. */
async function target(tx: Pick<typeof db, "select">, actor: Actor, userId: string, lock = false): Promise<Row> {
  if (actor.id === userId) throw new AdminError("Anda tidak bisa mengelola akun sendiri di sini. Pakai halaman Keamanan.", "SELF_ACTION");
  const q = tx
    .select({ id: user.id, email: user.email, role: user.role, username: user.username, twoFactorEnabled: user.twoFactorEnabled, deletedAt: user.deletedAt })
    .from(user)
    .where(eq(user.id, userId));
  const [row] = await (lock ? q.for("update") : q);
  if (!row) throw new AdminError("Pengguna tidak ditemukan.");
  if (row.deletedAt) throw new AdminError("Akun ini sudah dihapus. Tidak ada aksi yang bisa dilakukan.", "USER_DELETED");
  return row;
}

/** Best effort: a failed email never fails the action. No password, no token, no link. */
function notifySecurityChange(email: string, what: string) {
  void getBrandName()
    .then((brand) =>
      sendEmail({
        to: email,
        subject: `Keamanan akun ${brand} Anda diubah`,
        text: `Keamanan akun ${brand} Anda diubah oleh admin: ${what}.\n\nBila Anda tidak merasa meminta bantuan ini, hubungi dukungan kami.`,
      }),
    )
    .catch((err: unknown) => {
      console.error(`[admin] security email failed reason=${err instanceof Error ? err.message : "unknown"}`);
    });
}

/** Display name only (`user.name`). The console keeps its own copy and does not follow. */
export async function adminRenameUser(actor: Actor, userId: string, rawName: string): Promise<{ changed: boolean }> {
  const name = rawName.trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) throw new AdminError(`Nama harus ${NAME_MIN} sampai ${NAME_MAX} karakter.`);
  return db.transaction(async (tx) => {
    await target(tx, actor, userId, true);
    const [before] = await tx.select({ name: user.name }).from(user).where(eq(user.id, userId));
    if (before.name === name) return { changed: false };
    await tx.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, userId));
    await writeAudit(tx, { actor, action: "user.rename", target: `user:${userId}`, after: { changed: true } });
    return { changed: true };
  });
}

/**
 * Sets the password of the user's email+password login (creating that login for a social-only user) and signs them out everywhere.
 * The hash comes from Better Auth's own `hashPassword` (the default algorithm; auth.ts configures no custom one), so the normal
 * sign-in verifies it.
 */
export async function adminSetUserPassword(actor: Actor, userId: string, password: string): Promise<{ createdCredential: boolean; sessionsRevoked: number }> {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) throw new AdminError(`Kata sandi harus ${PASSWORD_MIN} sampai ${PASSWORD_MAX} karakter.`);
  const hash = await hashPassword(password);
  const done = await db.transaction(async (tx) => {
    const row = await target(tx, actor, userId, true);
    const now = new Date();
    const updated = await tx
      .update(account)
      .set({ password: hash, updatedAt: now })
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    const createdCredential = updated.length === 0;
    if (createdCredential) {
      await tx.insert(account).values({ id: randomUUID(), accountId: userId, providerId: "credential", userId, password: hash, createdAt: now, updatedAt: now });
    }
    const revoked = await tx.delete(session).where(eq(session.userId, userId)).returning({ id: session.id });
    await writeAudit(tx, { actor, action: "user.password.set", target: `user:${userId}`, after: { createdCredential, sessionsRevoked: revoked.length } });
    return { email: row.email, createdCredential, sessionsRevoked: revoked.length };
  });
  notifySecurityChange(done.email, "kata sandi diatur ulang");
  return { createdCredential: done.createdCredential, sessionsRevoked: done.sessionsRevoked };
}

/** Removes the user's 2FA secret and backup codes and signs them out everywhere. */
export async function adminResetUserTwoFactor(actor: Actor, userId: string): Promise<{ sessionsRevoked: number }> {
  const row = await target(db, actor, userId);
  const [{ n }] = await db.select({ n: count() }).from(twoFactor).where(eq(twoFactor.userId, userId));
  if (row.twoFactorEnabled !== true && n === 0) throw new AdminError("Pengguna ini tidak memakai 2FA.", "NO_2FA");
  const result = await reset2faById(userId, actor);
  if (!result) throw new AdminError("Pengguna tidak ditemukan.");
  notifySecurityChange(result.email, "autentikasi dua faktor (2FA) direset");
  return { sessionsRevoked: result.sessionsRevoked };
}

/** Removes every passkey of the user and signs them out everywhere. */
export async function adminResetUserPasskeys(actor: Actor, userId: string): Promise<{ passkeysRemoved: number; sessionsRevoked: number }> {
  const done = await db.transaction(async (tx) => {
    const row = await target(tx, actor, userId, true);
    const removed = await tx.delete(passkey).where(eq(passkey.userId, userId)).returning({ id: passkey.id });
    // The throw rolls back nothing (no write yet); it only tells the admin there was nothing to reset.
    if (removed.length === 0) throw new AdminError("Pengguna ini tidak punya passkey.", "NO_PASSKEY");
    const revoked = await tx.delete(session).where(eq(session.userId, userId)).returning({ id: session.id });
    await writeAudit(tx, { actor, action: "user.passkeys.reset", target: `user:${userId}`, after: { passkeysRemoved: removed.length, sessionsRevoked: revoked.length } });
    return { email: row.email, passkeysRemoved: removed.length, sessionsRevoked: revoked.length };
  });
  notifySecurityChange(done.email, "passkey direset");
  return { passkeysRemoved: done.passkeysRemoved, sessionsRevoked: done.sessionsRevoked };
}

export type DeleteResult = {
  /** disabled: the console account is switched off. pending: bridge failed, the worker retries. protected: the console refused (409). none: there was no console account. */
  console: "disabled" | "pending" | "none" | "protected";
  hadActivePlan: boolean;
  removed: Record<"sessions" | "accounts" | "passkeys" | "twoFactor" | "oauthTokens" | "oauthConsents" | "oauthClients" | "verifications", number>;
};

/**
 * Tombstone: the `user` row stays (orders, ledger, grants, audit and the console link point at its id), personal data goes.
 * One transaction. The console account is NOT deleted (the bridge has no delete); it is disabled right after, and the
 * `sync-console-status` worker retries if the bridge is down.
 */
export async function adminDeleteUser(actor: Actor, userId: string, confirmation: string): Promise<DeleteResult> {
  const activePlan = await getActivePlanForUser(userId);
  const done = await db.transaction(async (tx) => {
    const row = await target(tx, actor, userId, true);
    if (row.role === "admin") throw new AdminError("Akun admin tidak bisa dihapus. Turunkan perannya menjadi user dulu.", "IS_ADMIN");
    if (confirmation.trim() !== (row.username ?? row.email)) throw new AdminError("Konfirmasi tidak cocok. Ketik ulang persis seperti yang tertera.", "CONFIRM_MISMATCH");
    const [{ n: pending }] = await tx.select({ n: count() }).from(orders).where(and(eq(orders.userId, userId), eq(orders.status, "pending")));
    if (pending > 0) throw new AdminError(`Pengguna punya ${pending} pesanan yang belum dibayar. Tunggu hingga kedaluwarsa atau batalkan dulu, karena pembayaran bisa masuk setelah akun hilang.`, "PENDING_ORDERS");

    const ids = async (q: Promise<{ id: string }[]>) => (await q).length;
    // Access tokens first; refresh tokens and owned clients cascade to the rest.
    const oauthTokens =
      (await ids(tx.delete(oauthAccessToken).where(eq(oauthAccessToken.userId, userId)).returning({ id: oauthAccessToken.id }))) +
      (await ids(tx.delete(oauthRefreshToken).where(eq(oauthRefreshToken.userId, userId)).returning({ id: oauthRefreshToken.id })));
    const removed: DeleteResult["removed"] = {
      oauthTokens,
      oauthConsents: await ids(tx.delete(oauthConsent).where(eq(oauthConsent.userId, userId)).returning({ id: oauthConsent.id })),
      oauthClients: await ids(tx.delete(oauthClient).where(eq(oauthClient.userId, userId)).returning({ id: oauthClient.id })),
      sessions: await ids(tx.delete(session).where(eq(session.userId, userId)).returning({ id: session.id })),
      accounts: await ids(tx.delete(account).where(eq(account.userId, userId)).returning({ id: account.id })),
      passkeys: await ids(tx.delete(passkey).where(eq(passkey.userId, userId)).returning({ id: passkey.id })),
      twoFactor: await ids(tx.delete(twoFactor).where(eq(twoFactor.userId, userId)).returning({ id: twoFactor.id })),
      // Pending reset / verification tokens: Better Auth keys them by the user id (value) or the email (identifier).
      verifications: await ids(
        tx
          .delete(verification)
          .where(or(eq(verification.value, userId), eq(verification.identifier, userId), sql`lower(${verification.identifier}) = ${row.email.toLowerCase()}`))
          .returning({ id: verification.id }),
      ),
    };

    const now = new Date();
    await tx
      .update(user)
      .set({
        deletedAt: now,
        updatedAt: now,
        email: `deleted+${userId}@deleted.invalid`,
        name: DELETED_NAME,
        image: null,
        username: null,
        displayUsername: null,
        twoFactorEnabled: false,
        banned: true,
        banReason: DELETED_REASON,
        banExpires: null,
      })
      .where(eq(user.id, userId));
    await writeAudit(tx, { actor, action: "user.delete", target: `user:${userId}`, before: { role: row.role === "admin" ? "admin" : "user" }, after: { deleted: true, hadActivePlan: Boolean(activePlan), removed } });
    return removed;
  });

  let state: Awaited<ReturnType<typeof syncConsoleAccountStatus>>["state"];
  try {
    state = (await syncConsoleAccountStatus(userId)).state;
  } catch {
    state = "pending";
  }
  const console_: DeleteResult["console"] = state === "no_account" ? "none" : state === "in_sync" || state === "synced" ? "disabled" : state === "protected" ? "protected" : "pending";
  return { console: console_, hadActivePlan: Boolean(activePlan), removed: done };
}
