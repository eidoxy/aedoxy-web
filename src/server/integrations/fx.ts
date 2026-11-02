import { z } from "zod";

/**
 * USD -> IDR quotes for DISPLAY only (F04). No keys, plain fetch with a 5 s
 * timeout. Whatever a source answers is validated; a quote is never used for
 * an order amount.
 */

export const FRANKFURTER_SOURCE = "ECB (Frankfurter)";
export const ER_API_SOURCE = "ExchangeRate-API";
export const FRANKFURTER_URL = "https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR";
export const ER_API_URL = "https://open.er-api.com/v6/latest/USD";
const TIMEOUT_MS = 5_000;

export type FxSample = { source: string; rate: number; /** yyyy-mm-dd */ sourceDate: string };

export type FxErrorKind = "network" | "timeout" | "http" | "invalid";

export class FxError extends Error {
  constructor(
    readonly source: string,
    readonly kind: FxErrorKind,
    message: string,
  ) {
    super(`${source}: ${message}`);
    this.name = "FxError";
  }
}

const frankfurterBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rates: z.object({ IDR: z.number().positive().finite() }),
});

const erApiBody = z.object({
  result: z.literal("success"),
  time_last_update_unix: z.number().int().positive(),
  rates: z.object({ IDR: z.number().positive().finite() }),
});

async function getJson(source: string, url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new FxError(source, timedOut ? "timeout" : "network", timedOut ? "timed out" : "request failed");
  }
  if (!res.ok) throw new FxError(source, "http", `HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new FxError(source, "invalid", "body is not JSON");
  }
}

function parse<T extends z.ZodType>(source: string, schema: T, body: unknown): z.infer<T> {
  const r = schema.safeParse(body);
  if (!r.success) throw new FxError(source, "invalid", "unexpected response shape");
  return r.data;
}

/** Primary source: ECB reference rate, weekdays. */
export async function fetchFrankfurter(): Promise<FxSample> {
  const body = parse(FRANKFURTER_SOURCE, frankfurterBody, await getJson(FRANKFURTER_SOURCE, FRANKFURTER_URL));
  return { source: FRANKFURTER_SOURCE, rate: body.rates.IDR, sourceDate: body.date };
}

/** Backup source: ExchangeRate-API open endpoint (daily). Its terms ask for attribution, which the source label gives in the UI. */
export async function fetchErApi(): Promise<FxSample> {
  const body = parse(ER_API_SOURCE, erApiBody, await getJson(ER_API_SOURCE, ER_API_URL));
  return { source: ER_API_SOURCE, rate: body.rates.IDR, sourceDate: new Date(body.time_last_update_unix * 1000).toISOString().slice(0, 10) };
}
