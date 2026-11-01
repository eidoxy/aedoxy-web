import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "sk-test-bridge-token-123";
const mockEnv = vi.hoisted(() => ({}) as { NEWAPI_INTERNAL_URL?: string; NEWAPI_BRIDGE_TOKEN?: string });
vi.mock("@/env", () => ({ env: mockEnv }));

import { ensureConsoleAccount, listActiveSubscriptions, NewApiError } from "./newapi";

const input = { subject: "user-1", email: "a@b.co", displayName: "Ada" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

async function failure(): Promise<NewApiError> {
  try {
    await ensureConsoleAccount(input);
  } catch (err) {
    return err as NewApiError;
  }
  throw new Error("expected ensureConsoleAccount to throw");
}

describe("ensureConsoleAccount", () => {
  beforeEach(() => {
    mockEnv.NEWAPI_INTERNAL_URL = "http://newapi.internal:3000";
    mockEnv.NEWAPI_BRIDGE_TOKEN = TOKEN;
  });
  afterEach(() => vi.unstubAllGlobals());

  it("posts subject, email and display_name with the bearer token and maps the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ success: true, message: "", data: { user_id: 42, username: "aedoxy_1", created: true } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureConsoleAccount(input)).resolves.toEqual({ userId: 42, username: "aedoxy_1", created: true });

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://newapi.internal:3000/api/aedoxy/accounts/ensure");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(init.body as string)).toEqual({ subject: "user-1", email: "a@b.co", display_name: "Ada" });
  });

  it("fails with not_configured when the URL or token is missing", async () => {
    mockEnv.NEWAPI_BRIDGE_TOKEN = undefined;
    expect((await failure()).kind).toBe("not_configured");
  });

  it("maps a non-200 response to an http error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: false, message: "boom" }, 503)));
    const err = await failure();
    expect(err).toMatchObject({ kind: "http", status: 503 });
  });

  it("maps success:false with HTTP 200 to a rejected error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: false, message: "no access" })));
    expect((await failure()).kind).toBe("rejected");
  });

  it("maps a timeout and a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")));
    expect((await failure()).kind).toBe("timeout");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    expect((await failure()).kind).toBe("network");
  });

  it("rejects malformed JSON and unexpected shapes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    expect((await failure()).kind).toBe("invalid_response");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: true, data: { user_id: "x" } })));
    expect((await failure()).kind).toBe("invalid_response");
  });

  it("never leaks the token into error text", async () => {
    const cases: Array<() => Promise<Response>> = [
      async () => json({ success: false, message: `bad ${TOKEN}` }, 401),
      async () => new Response(`echo ${TOKEN}`, { status: 200 }),
      async () => {
        throw new TypeError(`connect failed for ${TOKEN}`);
      },
    ];
    for (const c of cases) {
      vi.stubGlobal("fetch", vi.fn().mockImplementation(c));
      const err = await failure();
      expect(`${err.name} ${err.message} ${err.stack ?? ""}`).not.toContain(TOKEN);
    }
  });
});

describe("listActiveSubscriptions", () => {
  beforeEach(() => {
    mockEnv.NEWAPI_INTERNAL_URL = "http://newapi.internal:3000";
    mockEnv.NEWAPI_BRIDGE_TOKEN = TOKEN;
  });
  afterEach(() => vi.unstubAllGlobals());

  const future = Math.floor(Date.now() / 1000) + 86_400;
  const sub = (over: Record<string, unknown>) => ({
    subscription: { id: 1, plan_id: 7, amount_total: 1_000_000, amount_used: 250_000, end_time: future, status: "active", ...over },
  });

  it("requests the user's subscriptions with the bearer token and keeps only live active ones", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        success: true,
        data: [
          sub({ id: 1 }),
          sub({ id: 2, status: "expired" }),
          sub({ id: 3, status: "cancelled" }),
          sub({ id: 4, end_time: 1_000 }),
          sub({ id: 5, amount_used: 2_000_000 }),
          { subscription: null },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listActiveSubscriptions(42);

    expect(result).toEqual([
      { id: 1, planId: 7, remainingQuota: 750_000, endsAt: new Date(future * 1000) },
      { id: 5, planId: 7, remainingQuota: 0, endsAt: new Date(future * 1000) },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://newapi.internal:3000/api/subscription/admin/users/42/subscriptions");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("maps rejection and bad shapes to typed errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: false, message: "no" })));
    await expect(listActiveSubscriptions(42)).rejects.toMatchObject({ kind: "rejected" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: true, data: "nope" })));
    await expect(listActiveSubscriptions(42)).rejects.toMatchObject({ kind: "invalid_response" });
  });
});
