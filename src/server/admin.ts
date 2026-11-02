import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { AdminError, type Actor } from "@/server/domain/audit";
import { consumeFreshAuth } from "@/server/domain/fresh-auth";
import { getSession } from "@/server/session";

/**
 * Admin guard (F00 task 12). The layout alone is not enough: layouts do not
 * re-render on client navigation and server actions are public endpoints, so
 * every admin page, server action and route handler calls one of these.
 */

type SessionLike = { user: { id: string; role?: string | null; twoFactorEnabled?: boolean | null } };

export type AdminAccess<S extends SessionLike = SessionLike> =
  | { kind: "anonymous" }
  | { kind: "forbidden" }
  | { kind: "needs_2fa"; session: S }
  | { kind: "ok"; session: S };

/** Pure decision, so the three outcomes can be tested without a request. */
export function classifyAdmin<S extends SessionLike>(session: S | null): AdminAccess<S> {
  if (!session) return { kind: "anonymous" };
  if (session.user.role !== "admin") return { kind: "forbidden" };
  return session.user.twoFactorEnabled === true ? { kind: "ok", session } : { kind: "needs_2fa", session };
}

export type AdminRequestDecision = { kind: "next" } | { kind: "redirect"; to: string } | { kind: "not_found" };

/**
 * Pure decision for the proxy (src/proxy.ts), built on classifyAdmin so the rules live in one place.
 * Anonymous -> /login. Not an admin -> 404. Admin without 2FA -> /admin/security (unless already there).
 */
export function decideAdminRequest(session: SessionLike | null, pathname: string): AdminRequestDecision {
  const access = classifyAdmin(session);
  if (access.kind === "anonymous") return { kind: "redirect", to: "/login" };
  if (access.kind === "forbidden") return { kind: "not_found" };
  if (access.kind === "needs_2fa" && pathname !== "/admin/security" && !pathname.startsWith("/admin/security/")) {
    return { kind: "redirect", to: "/admin/security" };
  }
  return { kind: "next" };
}

/** For route handlers, which answer with a status code instead of throwing notFound()/redirect(). */
export async function getAdminAccess() {
  return classifyAdmin(await getSession());
}

/**
 * Pages and server actions. Not signed in -> /login. Not an admin -> 404 (the
 * admin area must not reveal that it exists). Admin without 2FA -> /admin/security,
 * unless `allowWithout2fa` (only that page itself).
 */
export async function requireAdmin(opts: { allowWithout2fa?: boolean } = {}) {
  const access = await getAdminAccess();
  if (access.kind === "anonymous") redirect("/login");
  if (access.kind === "forbidden") notFound();
  if (access.kind === "needs_2fa" && !opts.allowWithout2fa) redirect("/admin/security");
  return access.session;
}

/**
 * Client address for the audit log. shortcut: trusts x-forwarded-for as sent,
 * so it is only reliable behind a reverse proxy that overwrites the header;
 * upgrade when the deployment topology is fixed.
 */
export async function getAdminActor(session: SessionLike): Promise<Actor> {
  const h = await headers();
  const raw = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
  return { id: session.user.id, ip: raw ? raw.slice(0, 64) : null };
}

const FAIL_WINDOW_MS = 5 * 60_000;
const MAX_FAILS = 5;
// shortcut: in-memory per process (resets on restart, not shared between instances); better-auth only throttles HTTP calls, not auth.api. Move to the database before running more than one web instance.
const failures = new Map<string, number[]>();

export type CodeVerifier = (code: string) => Promise<void>;

/** 6 digits = TOTP, anything else = backup code. The verifier throws when the code is wrong. */
export async function verifyFreshCode(
  deps: { totp: CodeVerifier; backup: CodeVerifier },
  userId: string,
  rawCode: string,
  now = Date.now(),
): Promise<void> {
  const code = rawCode.replace(/\s+/g, "");
  if (!code) throw new AdminError("Masukkan kode 2FA.", "TOTP_REQUIRED");

  const recent = (failures.get(userId) ?? []).filter((t) => now - t < FAIL_WINDOW_MS);
  if (recent.length >= MAX_FAILS) {
    failures.set(userId, recent);
    throw new AdminError("Terlalu banyak kode salah. Coba lagi dalam beberapa menit.", "TOTP_RATE_LIMITED");
  }

  try {
    await (/^\d{6}$/.test(code) ? deps.totp(code) : deps.backup(code));
  } catch {
    failures.set(userId, [...recent, now]);
    throw new AdminError("Kode 2FA salah.", "TOTP_INVALID");
  }
  failures.delete(userId);
}

/**
 * A typed code is checked as before (TOTP or backup code, with the attempt limit). With no code, the caller
 * must have just done a passkey assertion: `consumeProof` spends that single-use proof (see domain/fresh-auth.ts).
 * A typed code never spends the proof.
 */
export async function verifyFreshAuth(
  deps: { totp: CodeVerifier; backup: CodeVerifier; consumeProof: () => Promise<boolean> },
  userId: string,
  rawCode: string,
  now = Date.now(),
): Promise<void> {
  if (rawCode.replace(/\s+/g, "")) return verifyFreshCode(deps, userId, rawCode, now);
  if (await deps.consumeProof()) return;
  throw new AdminError("Masukkan kode 2FA atau gunakan passkey.", "TOTP_REQUIRED");
}

/**
 * Re-authentication for sensitive actions, on the server, against the signed-in admin's own factors:
 * a fresh TOTP or backup code (`code`), OR a passkey assertion made from THIS session in the last 5 minutes
 * (single use). Throws AdminError when neither holds; call it BEFORE the change.
 */
export async function requireFreshAuth({ code = "" }: { code?: string } = {}) {
  const session = await requireAdmin();
  const h = await headers();
  await verifyFreshAuth(
    {
      totp: async (c) => void (await auth.api.verifyTOTP({ headers: h, body: { code: c } })),
      backup: async (c) => void (await auth.api.verifyBackupCode({ headers: h, body: { code: c, disableSession: true } })),
      consumeProof: () => consumeFreshAuth(session.session.id, "action"),
    },
    session.user.id,
    code,
  );
  return session;
}

/** Kept for the existing admin actions: the form's `totp` field, which may be empty after a passkey assertion. */
export async function requireFreshTotp(code: string) {
  return requireFreshAuth({ code });
}

/** Test hook: forget recorded failures. */
export function resetFreshCodeFailures() {
  failures.clear();
}
