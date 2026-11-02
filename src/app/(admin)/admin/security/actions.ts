"use server";

import { and, eq, ne } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { getAdminActor, requireAdmin, requireFreshTotp } from "@/server/admin";
import { formStrings, toActionError, type AdminFormState } from "@/server/admin-action";
import { auditSecurity, confirmPassword } from "@/server/admin-security";
import { db } from "@/server/db/client";
import { session as sessionTable } from "@/server/db/schema";

/** Result of an action that may hand back one-time secrets (backup codes). Shown once, never stored. */
export type SecurityFormState = AdminFormState & { codes?: string[] };

/** Shared by every sensitive action here: the account password AND a fresh 2FA proof. */
const confirmInput = z.object({ password: z.string().max(128).default(""), totp: z.string().max(64).default("") });

async function confirm(session: Awaited<ReturnType<typeof requireAdmin>>, raw: Record<string, string>) {
  const parsed = confirmInput.parse(raw);
  await confirmPassword(session.user.id, parsed.password);
  await requireFreshTotp(parsed.totp);
  return parsed.password;
}

/** Replaces all backup codes. The old ones stop working at once; the new ones are returned a single time. */
export async function regenerateBackupCodesAction(_prev: SecurityFormState, formData: FormData): Promise<SecurityFormState> {
  const session = await requireAdmin();
  try {
    const password = await confirm(session, formStrings(formData));
    const { backupCodes } = await auth.api.generateBackupCodes({ headers: await headers(), body: { password } });
    await auditSecurity(await getAdminActor(session), "admin.2fa.backup_codes_regenerate", { count: backupCodes.length });
    return { ok: "Kode cadangan baru dibuat. Kode lama sudah tidak berlaku.", codes: backupCodes };
  } catch (err) {
    return toActionError(err);
  }
}

/**
 * Switches 2FA off so the admin can enrol again. Other sessions are signed out first (a credential change
 * must not leave older sessions alive). The current session is replaced by Better Auth and, with 2FA off,
 * the admin gate sends the admin back to /admin/security to enrol.
 */
export async function resetTwoFactorAction(_prev: SecurityFormState, formData: FormData): Promise<SecurityFormState> {
  const session = await requireAdmin();
  try {
    const password = await confirm(session, formStrings(formData));
    await db.delete(sessionTable).where(and(eq(sessionTable.userId, session.user.id), ne(sessionTable.id, session.session.id)));
    await auth.api.disableTwoFactor({ headers: await headers(), body: { password } });
    await auditSecurity(await getAdminActor(session), "admin.2fa.reset");
    return { ok: "2FA dinonaktifkan. Daftarkan ulang sekarang." };
  } catch (err) {
    return toActionError(err);
  }
}
