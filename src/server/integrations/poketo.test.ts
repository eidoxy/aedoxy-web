import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "sk_test_super_secret_key_123";
const mockEnv = vi.hoisted(() => ({}) as { POKETO_SECRET_KEY?: string; POKETO_BASE_URL: string });
vi.mock("@/env", () => ({ env: mockEnv }));

import {
  cancelInvoice,
  createInvoice,
  extractWebhookRefs,
  getInvoice,
  PoketoError,
  simulateInvoice,
  verifyPoketoSignature,
} from "./poketo";

const SECRET = "whsec_test";
const NOW = 1_800_000_000_000;
const sign = (body: string, t: number, secret = SECRET) =>
  createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
const nowSec = NOW / 1000;

describe("verifyPoketoSignature", () => {
  const body = '{"type":"invoice.paid","data":{"referenceId":"ADX-1"}}';
  const header = (t = nowSec, secret = SECRET) => `t=${t},v1=${sign(body, t, secret)}`;

  it("accepts a valid signature", () => {
    expect(verifyPoketoSignature(body, header(), SECRET, NOW)).toEqual({ ok: true });
  });

  it("rejects a body changed by one byte", () => {
    expect(verifyPoketoSignature(body.replace("ADX-1", "ADX-2"), header(), SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an old timestamp and one from the future", () => {
    expect(verifyPoketoSignature(body, header(nowSec - 301), SECRET, NOW)).toEqual({ ok: false, reason: "stale" });
    expect(verifyPoketoSignature(body, header(nowSec + 301), SECRET, NOW)).toEqual({ ok: false, reason: "stale" });
    expect(verifyPoketoSignature(body, header(nowSec - 299), SECRET, NOW)).toEqual({ ok: true });
  });

  it("rejects the wrong secret", () => {
    expect(verifyPoketoSignature(body, header(nowSec, "whsec_other"), SECRET, NOW)).toEqual({ ok: false, reason: "mismatch" });
  });

  it("rejects an empty secret even with a header that matches an empty key", () => {
    expect(verifyPoketoSignature(body, header(nowSec, ""), "", NOW)).toEqual({ ok: false, reason: "no_secret" });
    expect(verifyPoketoSignature(body, header(), undefined, NOW)).toEqual({ ok: false, reason: "no_secret" });
  });

  it.each([null, undefined, "", "garbage", "t=abc,v1=00", `t=${nowSec}`, `v1=${"a".repeat(64)}`, `t=${nowSec},v1=zz`, `t=${nowSec},v1=`])(
    "returns malformed or mismatch (never throws) for header %j",
    (bad) => {
      const result = verifyPoketoSignature(body, bad, SECRET, NOW);
      expect(result.ok).toBe(false);
    },
  );

  it("accepts when any of several v1 values matches", () => {
    const h = `t=${nowSec},v1=${"0".repeat(64)},v1=${sign(body, nowSec)},v1=deadbeef`;
    expect(verifyPoketoSignature(body, h, SECRET, NOW)).toEqual({ ok: true });
  });
});

describe("extractWebhookRefs", () => {
  const uuid = "6f1c1e0e-2b0c-4a53-9f59-0a9d1b0a1c11";
  it.each([
    ["data.referenceId", { data: { referenceId: "ADX-1" } }, ["ADX-1"]],
    ["data.invoice.referenceId", { data: { invoice: { referenceId: "ADX-2" } } }, ["ADX-2"]],
    ["referenceId", { referenceId: "ADX-3" }, ["ADX-3"]],
    ["data.metadata.order_id", { data: { metadata: { order_id: uuid } } }, [uuid]],
    ["metadata.order_id", { metadata: { order_id: uuid } }, [uuid]],
    ["priority order, deduped", { data: { referenceId: "ADX-1", metadata: { order_id: uuid } }, referenceId: "ADX-1" }, ["ADX-1", uuid]],
  ])("finds the reference in %s", (_name, payload, expected) => {
    expect(extractWebhookRefs(payload).references).toEqual(expected);
  });

  it("collects invoice numbers and ignores junk", () => {
    expect(extractWebhookRefs({ data: { id: "INV-PKT-9" } }).invoiceIds).toEqual(["INV-PKT-9"]);
    expect(extractWebhookRefs(null)).toEqual({ references: [], invoiceIds: [] });
    expect(extractWebhookRefs({ data: { referenceId: 42 } })).toEqual({ references: [], invoiceIds: [] });
    expect(extractWebhookRefs({ data: { referenceId: "x".repeat(200) } }).references).toEqual([]);
  });
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const invoice = { id: "INV-PKT-1", status: "pending", amount: 55000, referenceId: "ADX-20261101-AAAA1111", paymentUrl: "https://pay.poketo.id/inv/x" };
const input = {
  amount: 55000,
  referenceId: "ADX-20261101-AAAA1111",
  items: [{ name: "Bulanan", quantity: 1, price: 55000 }],
};

async function failure(run: () => Promise<unknown>): Promise<PoketoError> {
  try {
    await run();
  } catch (err) {
    return err as PoketoError;
  }
  throw new Error("expected a PoketoError");
}

describe("Poketo client", () => {
  beforeEach(() => {
    mockEnv.POKETO_SECRET_KEY = KEY;
    mockEnv.POKETO_BASE_URL = "http://poketo.test/api/v1/";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("creates an invoice with bearer key and idempotency key, and unwraps { data }", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: invoice }, 201));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createInvoice(input);
    expect(result).toMatchObject({ id: "INV-PKT-1", paymentUrl: "https://pay.poketo.id/inv/x" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://poketo.test/api/v1/invoices");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers["Idempotency-Key"]).toBe(input.referenceId);
    expect(JSON.parse(init.body as string)).toMatchObject({ amount: 55000, referenceId: input.referenceId });
  });

  it("accepts an unwrapped invoice too", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(invoice)));
    await expect(getInvoice(invoice.referenceId)).resolves.toMatchObject({ status: "pending", amount: 55000 });
  });

  it("rejects items that do not add up before calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const err = await failure(() => createInvoice({ ...input, items: [{ name: "x", quantity: 1, price: 1 }] }));
    expect(err.kind).toBe("invalid_request");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries 429 after the Retry-After delay", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ error: { code: "too_many_requests", message: "x" } }, 429, { "Retry-After": "2" }))
      .mockResolvedValueOnce(json({ data: invoice }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = getInvoice("ADX-1");
    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({ id: "INV-PKT-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries 5xx at most twice, then throws with status and code", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ error: { code: "internal_error", message: "x" } }, 503));
    vi.stubGlobal("fetch", fetchMock);
    const err = await failure(() => getInvoice("ADX-1"));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(err).toMatchObject({ kind: "http", status: 503, code: "internal_error", transient: true });
  });

  it("retries a network error, and does not retry a 400", async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(json({ data: invoice }));
    vi.stubGlobal("fetch", flaky);
    await expect(getInvoice("ADX-1")).resolves.toBeTruthy();
    expect(flaky).toHaveBeenCalledTimes(2);

    const bad = vi.fn().mockResolvedValue(json({ error: { code: "invalid_request", message: "x" } }, 400));
    vi.stubGlobal("fetch", bad);
    const err = await failure(() => createInvoice(input));
    expect(bad).toHaveBeenCalledTimes(1);
    expect(err).toMatchObject({ status: 400, code: "invalid_request", transient: false });
  });

  it("never retries cancel or simulate", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json({ error: { code: "internal_error", message: "x" } }, 500));
    vi.stubGlobal("fetch", fetchMock);
    await failure(() => cancelInvoice("ADX-1"));
    await failure(() => simulateInvoice("ADX-1", "paid"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("http://poketo.test/api/v1/invoices/ADX-1/simulate");
    expect(JSON.parse(init.body as string)).toEqual({ result: "paid", paymentMethod: "QRIS" });
  });

  it("fails with not_configured without a key, and with invalid_response on a bad shape", async () => {
    mockEnv.POKETO_SECRET_KEY = undefined;
    expect((await failure(() => getInvoice("x"))).kind).toBe("not_configured");
    mockEnv.POKETO_SECRET_KEY = KEY;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ data: { id: 5 } })));
    expect((await failure(() => getInvoice("x"))).kind).toBe("invalid_response");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ data: { ...invoice, paymentUrl: null } })));
    expect((await failure(() => createInvoice(input))).kind).toBe("invalid_response");
  });

  it("never leaks the key into error text", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => json({ error: { code: "unauthorized", message: `bad key ${KEY}` } }, 401),
      async () => new Response(`echo ${KEY}`, { status: 200 }),
      async () => json({ error: { code: KEY, message: KEY } }, 400),
      async () => {
        throw new TypeError(`connect failed for ${KEY}`);
      },
    ];
    for (const c of cases) {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(c));
      const err = await failure(() => cancelInvoice("ADX-1"));
      expect(`${err.name} ${err.message} ${err.code ?? ""} ${err.stack ?? ""}`).not.toContain(KEY);
    }
  });
});
