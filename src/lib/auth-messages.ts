import { SOCIAL_DISABLED_CODE } from "@/lib/social";

/** User-facing auth messages (Indonesian). Pure: used by the server (ban message) and by the client forms. */

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const REASON_MAX = 200;
const pad = (n: number) => String(n).padStart(2, "0");

/** "5 November 2026 08.14 UTC". UTC on purpose: the server has no way to know the visitor's zone, and the label says which one it is. */
export function formatBanDate(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad(d.getUTCHours())}.${pad(d.getUTCMinutes())} UTC`;
}

/**
 * Shown when a banned user signs in. The reason is operator-written (scripts/ban-user.ts) and is shown as plain text, so it is
 * collapsed to one line and cut at 200 characters. Rendering must stay escaped (React text), never innerHTML.
 */
export function bannedMessage(user: { banReason?: string | null; banExpires?: Date | string | null }): string {
  const reason = (user.banReason ?? "").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  const cut = reason.length > REASON_MAX ? `${reason.slice(0, REASON_MAX).trimEnd()}...` : reason;
  const until = user.banExpires ? new Date(user.banExpires) : null;
  const parts = [`Akun Anda diblokir${until && !Number.isNaN(until.getTime()) ? ` sampai ${formatBanDate(until)}` : ""}.`];
  if (cut) parts.push(`Alasan: ${cut}.`);
  parts.push("Hubungi dukungan bila Anda merasa ini keliru.");
  return parts.join(" ");
}

export const RATE_LIMITED_MESSAGE = "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";

/**
 * Maps a Better Auth client error to the text shown under a sign-in form. A ban is told only after the password (or passkey, or
 * provider) was accepted, so naming it does not reveal whether an account exists. Every other failure keeps the caller's fallback.
 */
export function signInErrorMessage(error: { code?: string; status?: number; message?: string }, fallback: string): string {
  if (error.status === 429) return RATE_LIMITED_MESSAGE;
  if (error.code === "BANNED_USER") return error.message?.trim() || bannedMessage({});
  if (error.code === SOCIAL_DISABLED_CODE && error.message) return error.message;
  return fallback;
}

/**
 * `?error=` on /login after a social sign-in fails. The code comes from the URL, so nothing from the query is echoed back: only
 * fixed texts are returned (a crafted link cannot put its own words on the page). The ban reason therefore does not appear here;
 * it is shown when the user signs in with a password.
 */
export function socialErrorMessage(code: string | string[] | undefined): string | undefined {
  const c = (Array.isArray(code) ? code[0] : code)?.toLowerCase();
  if (!c) return undefined;
  if (c === "banned_user") return bannedMessage({});
  if (c === "social_login_disabled_google") return "Login dengan Google sedang dinonaktifkan.";
  if (c === "social_login_disabled_github") return "Login dengan GitHub sedang dinonaktifkan.";
  return "Masuk dengan akun sosial gagal. Coba lagi atau gunakan cara masuk lain.";
}
