"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminActor, requireAdmin } from "@/server/admin";
import { formStrings, toActionError, type AdminFormState } from "@/server/admin-action";
import { adminBanUser, adminRevokeUserSessions, adminSetUserRole, adminUnbanUser, USER_ROLES } from "@/server/domain/admin-users";
import { BAN_REASON_MAX, type BanResult } from "@/server/domain/ban-user";

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
