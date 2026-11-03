import { and, count, desc, eq, gt, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db/client";
import { account, orders, session, user } from "@/server/db/schema";
import { escapeLike } from "./admin-orders";
import { AdminError, writeAudit, type Actor } from "./audit";
import { bannedNowSql, isBannedNow } from "./ban-state";
import { BAN_REASON_MAX, banUserById, unbanUserById, type BanResult } from "./ban-user";

/** Admin reads and writes for /admin/users. Nothing here ever selects a password hash, token or 2FA secret. */

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MAX_PAGE_SIZE = 100;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const yesNo = z.enum(["yes", "no"]).optional().catch(undefined);

const querySchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  role: z.enum(USER_ROLES).optional().catch(undefined),
  status: z.enum(["active", "banned"]).optional().catch(undefined),
  verified: yesNo,
  console: z.enum(["linked", "unlinked"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
});

export type UserFilter = Omit<z.infer<typeof querySchema>, "page">;

/** URL query -> filter + page. A value that is not valid falls back to "no filter" (page 1). */
export function parseUserQuery(sp: Record<string, string | string[] | undefined>): { filter: UserFilter; page: number } {
  const { page, ...filter } = querySchema.parse(Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, first(v)])));
  return { filter: { ...filter, q: filter.q || undefined }, page };
}

function userWhere(f: UserFilter, now = new Date()): SQL | undefined {
  const conds: SQL[] = [];
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    conds.push(or(ilike(user.username, like), ilike(user.email, like), ilike(user.name, like)) as SQL);
  }
  if (f.role === "admin") conds.push(eq(user.role, "admin"));
  if (f.role === "user") conds.push(sql`coalesce(${user.role}, 'user') <> 'admin'`);
  if (f.status === "banned") conds.push(bannedNowSql(now));
  if (f.status === "active") conds.push(sql`not ${bannedNowSql(now)}`);
  if (f.verified) conds.push(eq(user.emailVerified, f.verified === "yes"));
  if (f.console === "linked") conds.push(isNotNull(user.newapiUserId));
  if (f.console === "unlinked") conds.push(isNull(user.newapiUserId));
  return conds.length ? and(...conds) : undefined;
}

export type ConsoleState = "linked" | "unlinked" | "disabled";
const consoleState = (r: { newapiUserId: number | null; consoleDisabled: boolean }): ConsoleState => (r.newapiUserId == null ? "unlinked" : r.consoleDisabled ? "disabled" : "linked");

export async function listAdminUsers(filter: UserFilter, page: number, pageSize: number) {
  const size = Math.min(Math.max(1, Math.trunc(pageSize) || 1), MAX_PAGE_SIZE);
  const pageNo = Math.max(1, Math.trunc(page) || 1);
  const where = userWhere(filter);
  const [rows, [{ n: total }]] = await Promise.all([
    db
      .select({
        id: user.id,
        username: user.username,
        name: user.name,
        email: user.email,
        role: user.role,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        banned: user.banned,
        banExpires: user.banExpires,
        newapiUserId: user.newapiUserId,
        consoleDisabled: user.consoleDisabled,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(size)
      .offset((pageNo - 1) * size),
    db.select({ n: count() }).from(user).where(where),
  ]);
  return {
    rows: rows.map(({ banned, banExpires, newapiUserId, consoleDisabled, role, twoFactorEnabled, ...r }) => ({
      ...r,
      role: role === "admin" ? ("admin" as const) : ("user" as const),
      twoFactorEnabled: twoFactorEnabled === true,
      banned: isBannedNow({ banned, banExpires }),
      banExpires,
      console: consoleState({ newapiUserId, consoleDisabled }),
    })),
    total,
  };
}

export type AdminUserDetail = NonNullable<Awaited<ReturnType<typeof getAdminUser>>>;

export async function getAdminUser(id: string) {
  const [u] = await db
    .select({
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      emailVerified: user.emailVerified,
      twoFactorEnabled: user.twoFactorEnabled,
      banned: user.banned,
      banReason: user.banReason,
      banExpires: user.banExpires,
      newapiUserId: user.newapiUserId,
      consoleDisabled: user.consoleDisabled,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  if (!u) return null;

  const [providers, [{ n: activeSessions }], recentOrders] = await Promise.all([
    db.selectDistinct({ providerId: account.providerId }).from(account).where(eq(account.userId, id)).orderBy(account.providerId),
    db.select({ n: count() }).from(session).where(and(eq(session.userId, id), gt(session.expiresAt, new Date()))),
    db
      .select({ id: orders.id, tradeNo: orders.tradeNo, status: orders.status, planName: sql<string | null>`${orders.planSnapshot}->>'name'`, createdAt: orders.createdAt })
      .from(orders)
      .where(eq(orders.userId, id))
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(5),
  ]);

  const banned = isBannedNow(u);
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    role: u.role === "admin" ? ("admin" as const) : ("user" as const),
    emailVerified: u.emailVerified,
    twoFactorEnabled: u.twoFactorEnabled === true,
    createdAt: u.createdAt,
    ban: { active: banned, reason: banned ? u.banReason : null, expires: banned ? u.banExpires : null },
    console: consoleState(u),
    providers: providers.map((p) => p.providerId),
    activeSessions,
    recentOrders,
  };
}

async function assertUserExists(id: string) {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.id, id)).limit(1);
  if (!row) throw new AdminError("Pengguna tidak ditemukan.");
}

/** Blocks a user (reason 1-200 characters, optional end date in the future), revokes their sessions and pushes the console. */
export async function adminBanUser(actor: Actor, userId: string, input: { reason: string; expiresAt?: Date | null }, now = new Date()): Promise<BanResult> {
  const reason = input.reason.trim();
  if (!reason || reason.length > BAN_REASON_MAX) throw new AdminError(`Alasan wajib diisi, maksimal ${BAN_REASON_MAX} karakter.`);
  if (input.expiresAt && !(input.expiresAt.getTime() > now.getTime())) throw new AdminError("Tanggal berakhir harus di masa depan.");
  if (actor.id === userId) throw new AdminError("Anda tidak bisa memblokir akun sendiri.", "SELF_ACTION");
  const result = await banUserById(userId, { actor, reason, expiresAt: input.expiresAt });
  if (!result) throw new AdminError("Pengguna tidak ditemukan.");
  return result;
}

export async function adminUnbanUser(actor: Actor, userId: string): Promise<BanResult> {
  const result = await unbanUserById(userId, actor);
  if (!result) throw new AdminError("Pengguna tidak ditemukan.");
  return result;
}

/** user <-> admin. Not on yourself, never the last admin. The admin rows are locked so two demotions cannot both pass the check. */
export async function adminSetUserRole(actor: Actor, userId: string, role: string): Promise<{ changed: boolean; role: UserRole }> {
  const next = USER_ROLES.find((r) => r === role);
  if (!next) throw new AdminError("Peran tidak valid.");
  if (actor.id === userId) throw new AdminError("Anda tidak bisa mengubah peran akun sendiri.", "SELF_ACTION");

  return db.transaction(async (tx) => {
    const admins = await tx.select({ id: user.id }).from(user).where(eq(user.role, "admin")).for("update");
    const [row] = await tx.select({ id: user.id, role: user.role }).from(user).where(eq(user.id, userId)).for("update");
    if (!row) throw new AdminError("Pengguna tidak ditemukan.");
    const before: UserRole = row.role === "admin" ? "admin" : "user";
    if (before === next) return { changed: false, role: next };
    if (before === "admin" && admins.length <= 1) throw new AdminError("Tidak bisa menurunkan admin terakhir.", "LAST_ADMIN");

    await tx.update(user).set({ role: next, updatedAt: new Date() }).where(eq(user.id, userId));
    await writeAudit(tx, { actor, action: "user.role", target: `user:${userId}`, before: { role: before }, after: { role: next } });
    return { changed: true, role: next };
  });
}

/** "Keluarkan dari semua perangkat". */
export async function adminRevokeUserSessions(actor: Actor, userId: string): Promise<{ sessionsRevoked: number }> {
  await assertUserExists(userId);
  return db.transaction(async (tx) => {
    const revoked = await tx.delete(session).where(eq(session.userId, userId)).returning({ id: session.id });
    await writeAudit(tx, { actor, action: "user.sessions_revoke", target: `user:${userId}`, after: { sessionsRevoked: revoked.length } });
    return { sessionsRevoked: revoked.length };
  });
}
