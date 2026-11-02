"use server";

import { isAPIError } from "better-auth/api";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";
import { setShowActivity } from "@/server/domain/activity";
import { createRateLimiter } from "@/server/rate-limit";
import { requireSession } from "@/server/session";

export type SettingsState = { ok?: string; error?: string };

/** F07 opt-out. The checkbox posts "on" only when the switch is on. */
export async function saveActivityPreferenceAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const session = await requireSession();
  try {
    await setShowActivity(session.user.id, formData.get("show") === "on");
  } catch (err) {
    console.error(`[settings] save failed user=${session.user.id} reason=${err instanceof Error ? err.message : "unknown"}`);
    return { error: "Pengaturan belum tersimpan. Coba lagi." };
  }
  updateTag("activity"); // the public feed drops or restores this user right away
  return { ok: "Pengaturan disimpan." };
}

// Light throttle per user, also against password guessing. auth.api calls are not covered by Better Auth's HTTP rate limit.
const allowTrustChange = createRateLimiter({ windowMs: 60_000, max: 5 });
const trustInput = z.object({ trusted: z.boolean(), password: z.string().max(128).optional() });

/** "Percayai perangkat ini selama 30 hari": changes only the caller's current session. */
export async function saveSessionTrustAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const { user } = await requireSession();
  const parsed = trustInput.safeParse({
    trusted: formData.get("trusted") === "on",
    password: typeof formData.get("password") === "string" ? (formData.get("password") as string) : undefined,
  });
  if (!parsed.success) return { error: "Permintaan tidak valid." };
  if (!allowTrustChange(user.id)) return { error: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." };

  try {
    await auth.api.setSessionTrust({ headers: await headers(), body: parsed.data });
  } catch (err) {
    if (isAPIError(err) && err.body?.code === "INVALID_PASSWORD") return { error: "Kata sandi salah." };
    console.error(`[settings] session trust failed user=${user.id} reason=${err instanceof Error ? err.message : "unknown"}`);
    return { error: "Pengaturan belum tersimpan. Coba lagi." };
  }
  return { ok: parsed.data.trusted ? "Perangkat ini dipercaya selama 30 hari." : "Sesi ini kembali berakhir dalam 1 hari." };
}
