"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminActor, requireAdmin, requireFreshAuth } from "@/server/admin";
import { formStrings, toActionError, type AdminFormState } from "@/server/admin-action";
import { adminDeleteUser, adminRenameUser, adminResetUserPasskeys, adminResetUserTwoFactor, adminSetUserPassword, NAME_MAX, NAME_MIN, PASSWORD_MAX, PASSWORD_MIN, type DeleteResult } from "@/server/domain/admin-user-manage";
import { adminBanUser, adminRevokeUserSessions, adminSetUserRole, adminUnbanUser, USER_ROLES } from "@/server/domain/admin-users";
import { AdminError } from "@/server/domain/audit";
import { BAN_REASON_MAX, type BanResult } from "@/server/domain/ban-user";
import { hitRateLimit } from "@/server/rate-limit";

const userId = z.string().min(1).max(128);

function refresh(id: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
}

const CONSOLE_LINE: Record<BanResult["console"], string> = {
  disabled: "Console: dinonaktifkan.",
  enabled: "Console: diaktifkan.",
  none: "Console: belum ada akun.",
  pending: "Console: tertunda, worker akan mengulang.",
  protected: "Console menolak (admin di console, 409). Turunkan perannya di console, lalu worker akan menyusul.",
};

const banInput = z.object({
  userId,
  reason: z.string().trim().min(1, "Alasan wajib diisi.").max(BAN_REASON_MAX, `Maksimal ${BAN_REASON_MAX} karakter.`),
  // <input type="date"> sends YYYY-MM-DD; the ban lasts through the end of that day in Jakarta time. Empty = no end date.
  until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid.")
    .refine((s) => !Number.isNaN(new Date(`${s}T23:59:59+07:00`).getTime()), "Tanggal tidak valid.")
    .or(z.literal(""))
    .default(""),
});

export async function banUserAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = banInput.safeParse(formStrings(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let message: string;
  try {
    const { userId: id, reason, until } = parsed.data;
    const r = await adminBanUser(await getAdminActor(session), id, { reason, expiresAt: until ? new Date(`${until}T23:59:59+07:00`) : null });
    message = `${r.changed ? "Pengguna diblokir" : "Blokir diperbarui"}. ${r.sessionsRevoked} sesi dicabut. ${CONSOLE_LINE[r.console]}`;
  } catch (err) {
    return toActionError(err);
  }
  refresh(parsed.data.userId);
  return { ok: message };
}

export async function unbanUserAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = z.object({ userId }).safeParse(formStrings(formData));
  if (!parsed.success) return { error: "Pengguna tidak valid." };
  let message: string;
  try {
    const r = await adminUnbanUser(await getAdminActor(session), parsed.data.userId);
    message = `${r.changed ? "Blokir dibuka" : "Pengguna tidak sedang diblokir"}. ${CONSOLE_LINE[r.console]}`;
  } catch (err) {
    return toActionError(err);
  }
  refresh(parsed.data.userId);
  return { ok: message };
}

const roleInput = z.object({ userId, role: z.enum(USER_ROLES, "Peran tidak valid.") });

export async function setUserRoleAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = roleInput.safeParse(formStrings(formData));
  if (!parsed.success) return { error: "Data tidak valid." };
  try {
    const r = await adminSetUserRole(await getAdminActor(session), parsed.data.userId, parsed.data.role);
    refresh(parsed.data.userId);
    return { ok: r.changed ? `Peran diubah menjadi ${r.role}.` : `Peran sudah ${r.role}.` };
  } catch (err) {
    return toActionError(err);
  }
}

export async function revokeSessionsAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = z.object({ userId }).safeParse(formStrings(formData));
  if (!parsed.success) return { error: "Pengguna tidak valid." };
  try {
    const r = await adminRevokeUserSessions(await getAdminActor(session), parsed.data.userId);
    refresh(parsed.data.userId);
    return { ok: `${r.sessionsRevoked} sesi dicabut.` };
  } catch (err) {
    return toActionError(err);
  }
}

// ---- account management: name, password, 2FA, passkeys, delete ----

/** At most 10 management actions a minute per admin. Fails closed: these change other people's credentials. */
async function limit(adminId: string) {
  const hit = await hitRateLimit({ key: `admin:users:manage:${adminId}`, windowMs: 60_000, max: 10, failOpen: false });
  if (!hit.allowed) throw new AdminError("Terlalu banyak aksi. Coba lagi dalam semenit.", "RATE_LIMITED");
}

/** Fresh admin proof (2FA code, backup code or a passkey assertion from this session), for changes to someone else's credentials. */
const totp = z.string().max(64).default("");

const renameInput = z.object({ userId, name: z.string().trim().min(NAME_MIN, `Nama minimal ${NAME_MIN} karakter.`).max(NAME_MAX, `Nama maksimal ${NAME_MAX} karakter.`) });

export async function renameUserAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = renameInput.safeParse(formStrings(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    await limit(session.user.id);
    const r = await adminRenameUser(await getAdminActor(session), parsed.data.userId, parsed.data.name);
    refresh(parsed.data.userId);
    return { ok: r.changed ? "Nama diubah. Nama di console tidak ikut berubah." : "Nama tidak berubah." };
  } catch (err) {
    return toActionError(err);
  }
}

const passwordInput = z.object({
  userId,
  password: z.string().min(PASSWORD_MIN, `Kata sandi minimal ${PASSWORD_MIN} karakter.`).max(PASSWORD_MAX, `Kata sandi maksimal ${PASSWORD_MAX} karakter.`),
  totp,
});

export async function setUserPasswordAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = passwordInput.safeParse(formStrings(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    await limit(session.user.id);
    await requireFreshAuth({ code: parsed.data.totp });
    const r = await adminSetUserPassword(await getAdminActor(session), parsed.data.userId, parsed.data.password);
    refresh(parsed.data.userId);
    return { ok: `Kata sandi diatur${r.createdCredential ? " (login dengan kata sandi dibuat untuk akun ini)" : ""}. ${r.sessionsRevoked} sesi dicabut. Pengguna diberi tahu lewat email.` };
  } catch (err) {
    return toActionError(err);
  }
}

const credentialInput = z.object({ userId, totp });

export async function resetUserTwoFactorAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = credentialInput.safeParse(formStrings(formData));
  if (!parsed.success) return { error: "Data tidak valid." };
  try {
    await limit(session.user.id);
    await requireFreshAuth({ code: parsed.data.totp });
    const r = await adminResetUserTwoFactor(await getAdminActor(session), parsed.data.userId);
    refresh(parsed.data.userId);
    return { ok: `2FA direset. ${r.sessionsRevoked} sesi dicabut. Pengguna diberi tahu lewat email.` };
  } catch (err) {
    return toActionError(err);
  }
}

export async function resetUserPasskeysAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = credentialInput.safeParse(formStrings(formData));
  if (!parsed.success) return { error: "Data tidak valid." };
  try {
    await limit(session.user.id);
    await requireFreshAuth({ code: parsed.data.totp });
    const r = await adminResetUserPasskeys(await getAdminActor(session), parsed.data.userId);
    refresh(parsed.data.userId);
    return { ok: `${r.passkeysRemoved} passkey dihapus. ${r.sessionsRevoked} sesi dicabut. Pengguna diberi tahu lewat email.` };
  } catch (err) {
    return toActionError(err);
  }
}

const DELETE_CONSOLE_LINE: Record<DeleteResult["console"], string> = {
  disabled: "Akun console dinonaktifkan; catatan di console dapat dihapus manual oleh admin console.",
  none: "Pengguna belum punya akun console.",
  pending: "Akun console belum sempat dinonaktifkan (bridge gagal); worker akan mengulang. Catatan di console dapat dihapus manual oleh admin console.",
  protected: "Console menolak menonaktifkan (admin di console, 409). Turunkan perannya di console, lalu worker akan menyusul.",
};

export async function deleteUserAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = z.object({ userId, confirm: z.string().max(254).default("") }).safeParse(formStrings(formData));
  if (!parsed.success) return { error: "Data tidak valid." };
  try {
    await limit(session.user.id);
    const r = await adminDeleteUser(await getAdminActor(session), parsed.data.userId, parsed.data.confirm);
    refresh(parsed.data.userId);
    return { ok: `Akun dihapus. ${DELETE_CONSOLE_LINE[r.console]}` };
  } catch (err) {
    return toActionError(err);
  }
}