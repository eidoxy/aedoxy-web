import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN = "sk-test-bridge-token-123";
const mockEnv = vi.hoisted(() => ({}) as { NEWAPI_INTERNAL_URL?: string; NEWAPI_BRIDGE_TOKEN?: string });
vi.mock("@/env", () => ({ env: mockEnv }));

import { ensureConsoleAccount, findSubscription, fulfillSubscription, listActiveSubscriptions, NewApiError, upsertPlan } from "./newapi";

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

describe("plans, fulfil and single subscription lookup", () => {
  beforeEach(() => {
    mockEnv.NEWAPI_INTERNAL_URL = "http://newapi.internal:3000";
    mockEnv.NEWAPI_BRIDGE_TOKEN = TOKEN;
  });
  afterEach(() => vi.unstubAllGlobals());

  const plan = { title: "t" } as Parameters<typeof upsertPlan>[0];

  it("upsertPlan posts a new plan and returns its id, or puts to the existing id", async () => {
    const fetchMock = vi.fn<(url: URL, init: RequestInit) => Promise<Response>>(async () => json({ success: true, data: { id: 31 } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(upsertPlan(plan)).resolves.toBe(31);
    await expect(upsertPlan(plan, 9)).resolves.toBe(9);

    const calls = fetchMock.mock.calls;
    expect([String(calls[0][0]), calls[0][1].method]).toEqual(["http://newapi.internal:3000/api/subscription/admin/plans", "POST"]);
    expect([String(calls[1][0]), calls[1][1].method]).toEqual(["http://newapi.internal:3000/api/subscription/admin/plans/9", "PUT"]);
    expect(JSON.parse(calls[0][1].body as string)).toEqual({ plan });
  });

  it("upsertPlan accepts the real PUT answer with data null, and rejects other shapes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: null, message: "", success: true })));
    await expect(upsertPlan(plan, 9)).resolves.toBe(9);
    vi.stubGlobal("fetch", vi.fn(async () => json({ success: true, data: "x" })));
    await expect(upsertPlan(plan, 9)).rejects.toMatchObject({ kind: "invalid_response" });
    vi.stubGlobal("fetch", vi.fn(async () => json({ success: true, data: null })));
    await expect(upsertPlan(plan)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("upsertPlan maps rejection and a create without an id to typed errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: false, message: "no" })));
    await expect(upsertPlan(plan)).rejects.toMatchObject({ kind: "rejected" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: true })));
    await expect(upsertPlan(plan)).rejects.toMatchObject({ kind: "invalid_response" });
  });

  it("fulfillSubscription sends the bridge fields and maps the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({ success: true, data: { already_fulfilled: false, user_subscription_id: 5, end_time: 1_800_000_000, replaced: [{ id: 4, remaining: 120 }] } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fulfillSubscription({ tradeNo: "ADX-1", newapiUserId: 3, newapiPlanId: 7, moneyIdr: 40_000, paymentMethod: "QRIS" });

    expect(result).toEqual({ alreadyFulfilled: false, subscriptionId: 5, endsAt: new Date(1_800_000_000_000), replaced: [{ id: 4, remaining: 120 }] });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("http://newapi.internal:3000/api/aedoxy/fulfill");
    expect(JSON.parse(init.body as string)).toEqual({ trade_no: "ADX-1", user_id: 3, plan_id: 7, money_idr: 40_000, payment_method: "QRIS" });
  });

  it("fulfillSubscription treats a null replaced list as empty and HTTP errors as http", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: true, data: { already_fulfilled: true, user_subscription_id: 5, end_time: 1_800_000_000, replaced: null } })));
    const input = { tradeNo: "ADX-1", newapiUserId: 3, newapiPlanId: 7, moneyIdr: 1, paymentMethod: "QRIS" };
    await expect(fulfillSubscription(input)).resolves.toMatchObject({ alreadyFulfilled: true, replaced: [] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ success: false, message: "x" }, 409)));
    await expect(fulfillSubscription(input)).rejects.toMatchObject({ kind: "http", status: 409 });
  });

  it("findSubscription returns an expired subscription by id, or null", async () => {
    const sub = { id: 8, plan_id: 7, amount_total: 1_000_000, amount_used: 400_000, end_time: 1_000, status: "expired" };
    vi.stubGlobal("fetch", vi.fn(async () => json({ success: true, data: [{ subscription: sub }] })));
    await expect(findSubscription(42, 8)).resolves.toMatchObject({ id: 8, remainingQuota: 600_000, status: "expired" });
    await expect(findSubscription(42, 9)).resolves.toBeNull();
  });
});
