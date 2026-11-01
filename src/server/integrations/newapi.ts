import { z } from "zod";
import { env } from "@/env";

/**
 * Client for the Go bridge in the New API fork (gateway-aedoxy,
 * controller/aedoxy_bridge.go). Auth is a service-account access token sent as
 * a Bearer header; the bridge needs no `New-Api-User` header for it.
 * Error messages never contain the token or the response body.
 */

const TIMEOUT_MS = 5_000;

const ensureResponse = z.union([
  z.object({
    success: z.literal(true),
    data: z.object({
      user_id: z.number().int().positive(),
      username: z.string(),
      created: z.boolean(),
    }),
  }),
  z.object({ success: z.literal(false), message: z.string().optional() }),
]);

export type NewApiErrorKind = "not_configured" | "timeout" | "network" | "http" | "rejected" | "invalid_response";

export class NewApiError extends Error {
  constructor(
    readonly kind: NewApiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "NewApiError";
  }
}

export type EnsureConsoleAccountInput = { subject: string; email: string; displayName: string };
export type ConsoleAccount = { userId: number; username: string; created: boolean };

/** Finds or creates the console user bound to `subject` (the Better Auth user id). Idempotent. */
export async function ensureConsoleAccount(input: EnsureConsoleAccountInput): Promise<ConsoleAccount> {
  const baseUrl = env.NEWAPI_INTERNAL_URL;
  const token = env.NEWAPI_BRIDGE_TOKEN;
  if (!baseUrl || !token) throw new NewApiError("not_configured", "New API bridge is not configured");

  let res: Response;
  try {
    res = await fetch(new URL("/api/aedoxy/accounts/ensure", baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subject: input.subject, email: input.email, display_name: input.displayName }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new NewApiError(timedOut ? "timeout" : "network", timedOut ? "Bridge request timed out" : "Bridge request failed");
  }

  if (!res.ok) throw new NewApiError("http", `Bridge returned HTTP ${res.status}`, res.status);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new NewApiError("invalid_response", "Bridge returned invalid JSON", res.status);
  }
  const parsed = ensureResponse.safeParse(json);
  if (!parsed.success) throw new NewApiError("invalid_response", "Bridge response has an unexpected shape", res.status);
  if (!parsed.data.success) throw new NewApiError("rejected", "Bridge rejected the request", res.status);

  const { user_id, username, created } = parsed.data.data;
  return { userId: user_id, username, created };
}
