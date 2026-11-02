import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchErApi, fetchFrankfurter, FxError } from "./fx";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const stub = (impl: (url: string) => Response | Promise<Response>) => vi.stubGlobal("fetch", async (url: string) => impl(String(url)));
afterEach(() => vi.unstubAllGlobals());

describe("fetchFrankfurter", () => {
  it("reads the IDR rate and date", async () => {
    stub((url) => {
      expect(url).toBe("https://api.frankfurter.dev/v1/latest?base=USD&symbols=IDR");
      return json({ amount: 1, base: "USD", date: "2026-10-30", rates: { IDR: 18148 } });
    });
    expect(await fetchFrankfurter()).toEqual({ source: "ECB (Frankfurter)", rate: 18148, sourceDate: "2026-10-30" });
  });

  it.each([
    ["HTTP error", () => json({}, 500), "http"],
    ["bad shape", () => json({ date: "2026-10-30", rates: {} }), "invalid"],
    ["string rate", () => json({ date: "2026-10-30", rates: { IDR: "18148" } }), "invalid"],
    ["bad date", () => json({ date: "30/10/2026", rates: { IDR: 18148 } }), "invalid"],
    ["not JSON", () => new Response("<html>", { status: 200 }), "invalid"],
  ])("rejects %s with a typed error", async (_n, make, kind) => {
    stub(make);
    await expect(fetchFrankfurter()).rejects.toMatchObject({ name: "FxError", kind });
  });

  it("maps a network failure and a timeout", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(fetchFrankfurter()).rejects.toMatchObject({ kind: "network" });
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    const err = await fetchFrankfurter().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FxError);
    expect(err).toMatchObject({ kind: "timeout" });
  });
});

describe("fetchErApi", () => {
  it("reads the IDR rate and the date of the last update", async () => {
    stub(() => json({ result: "success", time_last_update_unix: Date.UTC(2026, 10, 1, 0, 2) / 1000, rates: { IDR: 18131.95 } }));
    expect(await fetchErApi()).toEqual({ source: "ExchangeRate-API", rate: 18131.95, sourceDate: "2026-11-01" });
  });

  it("rejects an error result and a zero rate", async () => {
    stub(() => json({ result: "error", "error-type": "quota-reached" }));
    await expect(fetchErApi()).rejects.toMatchObject({ kind: "invalid" });
    stub(() => json({ result: "success", time_last_update_unix: 1_700_000_000, rates: { IDR: 0 } }));
    await expect(fetchErApi()).rejects.toMatchObject({ kind: "invalid" });
  });
});
