"use server";

import { redirect } from "next/navigation";
import { env } from "@/env";
import { ensureConsoleAccountForUser } from "@/server/account";
import { requireSession } from "@/server/session";

export type OpenConsoleState = { error?: string };

/**
 * "Buka Console": links the console account first when the earlier attempt failed,
 * then sends the user to the console sign-in page, where the "Aedoxy" button starts the OIDC flow.
 */
export async function openConsole(): Promise<OpenConsoleState> {
  const session = await requireSession();
  try {
    const linked = await ensureConsoleAccountForUser(session.user.id);
    if (linked == null) return { error: "Verifikasi email Anda dulu sebelum membuka console." };
  } catch (err) {
    console.error(`[console] link failed user=${session.user.id} reason=${err instanceof Error ? err.message : "unknown"}`);
    return { error: "Console belum bisa dihubungi. Coba lagi sebentar lagi." };
  }
  redirect(`${env.NEWAPI_PUBLIC_URL.replace(/\/+$/, "")}/sign-in`);
}
