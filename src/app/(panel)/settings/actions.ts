"use server";

import { updateTag } from "next/cache";
import { setShowActivity } from "@/server/domain/activity";
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
