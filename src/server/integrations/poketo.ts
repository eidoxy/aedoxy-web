import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/env";

/**
 * Thin Poketo client over `fetch` (the `poketo-node` SDK is not on npm, TRD
 * section 4). Reads and create retry up to 2 times on 429 (honouring
 * Retry-After), 5xx and network errors; cancel and simulate never retry.
 * Error text carries only the HTTP status and Poketo's error code, never the
 * API key, the request body or the response body.
 */

const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;
// shortcut: Retry-After is capped so a webhook handler (10 s budget at Poketo) is never stuck; revisit if Poketo asks for longer waits.
const MAX_RETRY_AFTER_MS = 5_000;
const BACKOFF_MS = 200;

export type PoketoErrorKind = "not_configured" | "timeout" | "network" | "http" | "invalid_response" | "invalid_request";

export class PoketoError extends Error {
  constructor(
    readonly kind: PoketoErrorKind,
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PoketoError";
  }

  /** True when repeating the same request later may succeed. */
  get transient(): boolean {
    return this.kind === "timeout" || this.kind === "network" || this.status === 429 || (this.status ?? 0) >= 500;
  }
}

const invoiceSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  amount: z.number().int(),
  referenceId: z.string().nullish(),
  paymentUrl: z.string().nullish(),
});
export type PoketoInvoice = z.infer<typeof invoiceSchema>;

export type CreateInvoiceInput = {
  amount: number;
  title?: string;
  description?: string;
  customer?: { name?: string; email?: string };
  items: { name: string; quantity: number; price: number }[];
  expiresInMinutes?: number;
  referenceId: string;
  redirectUrl?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryDelay(res: Response | undefined, attempt: number): number {
  const seconds = Number(res?.headers.get("retry-after"));
  if (res && Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
  return BACKOFF_MS * 2 ** attempt;
}

async function request(
  method: "GET" | "POST",
  path: string,
  opts: { body?: unknown; idempotencyKey?: string; retry: boolean },
): Promise<unknown> {
  const key = env.POKETO_SECRET_KEY;
  if (!key) throw new PoketoError("not_configured", "Poketo is not configured");
  const url = `${env.POKETO_BASE_URL.replace(/\/+$/, "")}${path}`;
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  for (let attempt = 0; ; attempt++) {
    const canRetry = opts.retry && attempt < MAX_RETRIES;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      if (canRetry) {
        await sleep(retryDelay(undefined, attempt));
        continue;
      }
      throw new PoketoError(timedOut ? "timeout" : "network", timedOut ? "Poketo request timed out" : "Poketo request failed");
    }

    if (res.ok) {
      try {
        return await res.json();
      } catch {
        throw new PoketoError("invalid_response", "Poketo returned invalid JSON", res.status);
      }
    }

    if (canRetry && (res.status === 429 || res.status >= 500)) {
      await res.body?.cancel().catch(() => undefined);
      await sleep(retryDelay(res, attempt));
      continue;
    }

    const body: unknown = await res.json().catch(() => undefined);
    const rawCode = (body as { error?: { code?: unknown } } | undefined)?.error?.code;
    const code = typeof rawCode === "string" && /^[a-z_]{1,64}$/.test(rawCode) ? rawCode : undefined;
    throw new PoketoError("http", `Poketo returned HTTP ${res.status}${code ? ` (${code})` : ""}`, res.status, code);
  }
}

function parseInvoice(json: unknown): PoketoInvoice {
  // The docs do not say whether the invoice is wrapped as { data }; accept both.
  const inner = typeof json === "object" && json !== null && "data" in json ? (json as { data: unknown }).data : json;
  const parsed = invoiceSchema.safeParse(inner);
  if (!parsed.success) throw new PoketoError("invalid_response", "Poketo invoice has an unexpected shape");
  return parsed.data;
}

/** Creates an invoice. `referenceId` doubles as the Idempotency-Key, so a retried call returns the first invoice. */
export async function createInvoice(input: CreateInvoiceInput): Promise<PoketoInvoice & { paymentUrl: string }> {
  const sum = input.items.reduce((total, item) => total + item.quantity * item.price, 0);
  if (!Number.isInteger(input.amount) || sum !== input.amount) {
    throw new PoketoError("invalid_request", "Invoice items must add up to the amount");
  }
  const invoice = parseInvoice(
    await request("POST", "/invoices", { body: input, idempotencyKey: input.referenceId, retry: true }),
  );
  if (!invoice.paymentUrl) throw new PoketoError("invalid_response", "Poketo invoice has no paymentUrl");
  return { ...invoice, paymentUrl: invoice.paymentUrl };
}

/** `idOrReference` is the Poketo invoice number or our referenceId (trade_no). */
export async function getInvoice(idOrReference: string): Promise<PoketoInvoice> {
  return parseInvoice(await request("GET", `/invoices/${encodeURIComponent(idOrReference)}`, { retry: true }));
}

export async function cancelInvoice(idOrReference: string): Promise<PoketoInvoice> {
  return parseInvoice(await request("POST", `/invoices/${encodeURIComponent(idOrReference)}/cancel`, { retry: false }));
}

/** Sandbox only (live keys get 403 sandbox_only). For test scripts. */
export async function simulateInvoice(
  idOrReference: string,
  result: "paid" | "expired",
  paymentMethod: "QRIS" | "VA" | "AKULAKU" | "CARD" = "QRIS",
): Promise<PoketoInvoice> {
  return parseInvoice(
    await request("POST", `/invoices/${encodeURIComponent(idOrReference)}/simulate`, {
      body: { result, paymentMethod },
      retry: false,
    }),
  );
}

export type SignatureResult = { ok: true } | { ok: false; reason: "no_secret" | "malformed" | "stale" | "mismatch" };

const MAX_SKEW_SECONDS = 300;

/**
 * Verifies `Poketo-Signature: t=<unix seconds>,v1=<hex>[,v1=<hex>]`, where v1 =
 * HMAC-SHA256(secret, "<t>.<rawBody>"). Never throws on bad input.
 */
export function verifyPoketoSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string | null | undefined,
  nowMs: number = Date.now(),
): SignatureResult {
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!header) return { ok: false, reason: "malformed" };

  let t: string | undefined;
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name === "t") t = value;
    else if (name === "v1") candidates.push(value);
  }
  if (!t || !/^\d{1,12}$/.test(t) || candidates.length === 0) return { ok: false, reason: "malformed" };

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest();
  const matches = candidates.some((hex) => {
    const given = Buffer.from(hex, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matches) return { ok: false, reason: "mismatch" };
  if (Math.abs(nowMs / 1000 - Number(t)) > MAX_SKEW_SECONDS) return { ok: false, reason: "stale" };
  return { ok: true };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => UUID.test(value);

function pick(root: unknown, path: string[]): string | undefined {
  let node = root;
  for (const key of path) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return typeof node === "string" && node.length > 0 && node.length <= 128 ? node : undefined;
}

/**
 * The webhook body is not fully documented, so look for our order in several
 * places. `references` are trade_no values or order ids, `invoiceIds` are
 * Poketo invoice numbers. Both lists are in priority order.
 */
export function extractWebhookRefs(payload: unknown): { references: string[]; invoiceIds: string[] } {
  const dedupe = (values: (string | undefined)[]) => [...new Set(values.filter((v): v is string => !!v))];
  return {
    references: dedupe([
      pick(payload, ["data", "referenceId"]),
      pick(payload, ["data", "invoice", "referenceId"]),
      pick(payload, ["referenceId"]),
      pick(payload, ["data", "metadata", "order_id"]),
      pick(payload, ["metadata", "order_id"]),
    ]),
    invoiceIds: dedupe([pick(payload, ["data", "id"]), pick(payload, ["data", "invoice", "id"]), pick(payload, ["invoiceId"])]),
  };
}
