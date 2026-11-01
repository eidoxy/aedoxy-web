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

/** Sends one authenticated request to New API and returns the parsed JSON body. */
async function call(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<{ json: unknown; status: number }> {
  const baseUrl = env.NEWAPI_INTERNAL_URL;
  const token = env.NEWAPI_BRIDGE_TOKEN;
  if (!baseUrl || !token) throw new NewApiError("not_configured", "New API bridge is not configured");

  let res: Response;
  try {
    res = await fetch(new URL(path, baseUrl), {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new NewApiError(timedOut ? "timeout" : "network", timedOut ? "Bridge request timed out" : "Bridge request failed");
  }

  if (!res.ok) throw new NewApiError("http", `Bridge returned HTTP ${res.status}`, res.status);

  try {
    return { json: await res.json(), status: res.status };
  } catch {
    throw new NewApiError("invalid_response", "Bridge returned invalid JSON", res.status);
  }
}

const subscriptionsResponse = z.union([
  z.object({
    success: z.literal(true),
    data: z.array(
      z.object({
        subscription: z
          .object({
            id: z.number().int(),
            plan_id: z.number().int(),
            amount_total: z.number(),
            amount_used: z.number(),
            end_time: z.number(),
            status: z.string(),
          })
          .nullable(),
      }),
    ),
  }),
  z.object({ success: z.literal(false), message: z.string().optional() }),
]);

export type ActiveSubscription = {
  id: number;
  planId: number;
  remainingQuota: number;
  endsAt: Date;
};

export type UserSubscription = ActiveSubscription & { status: string };

/** Every subscription of a console user, any status, from GET /api/subscription/admin/users/:id/subscriptions. */
async function listSubscriptions(newapiUserId: number): Promise<UserSubscription[]> {
  const { json, status } = await call("GET", `/api/subscription/admin/users/${newapiUserId}/subscriptions`);
  const parsed = subscriptionsResponse.safeParse(json);
  if (!parsed.success) throw new NewApiError("invalid_response", "Bridge response has an unexpected shape", status);
  if (!parsed.data.success) throw new NewApiError("rejected", "Bridge rejected the request", status);

  return parsed.data.data.flatMap(({ subscription: s }) =>
    s
      ? [
          {
            id: s.id,
            planId: s.plan_id,
            remainingQuota: Math.max(0, s.amount_total - s.amount_used),
            endsAt: new Date(s.end_time * 1000),
            status: s.status,
          },
        ]
      : [],
  );
}

/** Active (not expired, not cancelled) subscriptions of a console user. */
export async function listActiveSubscriptions(newapiUserId: number): Promise<ActiveSubscription[]> {
  const now = Date.now();
  return (await listSubscriptions(newapiUserId))
    .filter((s) => s.status === "active" && s.endsAt.getTime() > now)
    .map(({ id, planId, remainingQuota, endsAt }) => ({ id, planId, remainingQuota, endsAt }));
}

/** One subscription by id (any status), or null when the console no longer lists it. */
export async function findSubscription(newapiUserId: number, subscriptionId: number): Promise<UserSubscription | null> {
  return (await listSubscriptions(newapiUserId)).find((s) => s.id === subscriptionId) ?? null;
}

const planResponse = z.union([
  z.object({ success: z.literal(true), data: z.object({ id: z.number().int().positive() }).optional() }),
  z.object({ success: z.literal(false), message: z.string().optional() }),
]);

/** Plan fields in the shape of New API's SubscriptionPlan (JSON names). */
export type NewApiPlanInput = {
  title: string;
  subtitle: string;
  price_amount: number;
  currency: "USD";
  duration_unit: "hour" | "day";
  duration_value: number;
  enabled: boolean;
  sort_order: number;
  allow_balance_pay: boolean;
  allow_wallet_overflow: boolean;
  max_purchase_per_user: number;
  upgrade_group: string;
  total_amount: number;
  quota_reset_period: "never";
};

/** Creates the plan (no `planId`: POST /plans) or updates it (PUT /plans/:id). Returns the New API plan id. */
export async function upsertPlan(plan: NewApiPlanInput, planId?: number | null): Promise<number> {
  const { json, status } = planId
    ? await call("PUT", `/api/subscription/admin/plans/${planId}`, { plan })
    : await call("POST", "/api/subscription/admin/plans", { plan });
  const parsed = planResponse.safeParse(json);
  if (!parsed.success) throw new NewApiError("invalid_response", "Bridge response has an unexpected shape", status);
  if (!parsed.data.success) throw new NewApiError("rejected", "Bridge rejected the request", status);
  const id = planId ?? parsed.data.data?.id;
  if (!id) throw new NewApiError("invalid_response", "Bridge returned no plan id", status);
  return id;
}

const fulfillResponse = z.union([
  z.object({
    success: z.literal(true),
    data: z.object({
      already_fulfilled: z.boolean(),
      user_subscription_id: z.number().int().positive(),
      end_time: z.number().int().positive(),
      replaced: z.array(z.object({ id: z.number().int(), remaining: z.number().int().nonnegative() })).nullish(),
    }),
  }),
  z.object({ success: z.literal(false), message: z.string().optional() }),
]);

export type FulfillInput = { tradeNo: string; newapiUserId: number; newapiPlanId: number; moneyIdr: number; paymentMethod: string };
export type FulfillResult = {
  alreadyFulfilled: boolean;
  subscriptionId: number;
  endsAt: Date;
  replaced: { id: number; remaining: number }[];
};

/** POST /api/aedoxy/fulfill. Idempotent per `tradeNo` on the bridge side, so a retry after a timeout is safe. */
export async function fulfillSubscription(input: FulfillInput): Promise<FulfillResult> {
  const { json, status } = await call("POST", "/api/aedoxy/fulfill", {
    trade_no: input.tradeNo,
    user_id: input.newapiUserId,
    plan_id: input.newapiPlanId,
    money_idr: input.moneyIdr,
    payment_method: input.paymentMethod,
  });
  const parsed = fulfillResponse.safeParse(json);
  if (!parsed.success) throw new NewApiError("invalid_response", "Bridge response has an unexpected shape", status);
  if (!parsed.data.success) throw new NewApiError("rejected", "Bridge rejected the request", status);

  const d = parsed.data.data;
  return {
    alreadyFulfilled: d.already_fulfilled,
    subscriptionId: d.user_subscription_id,
    endsAt: new Date(d.end_time * 1000),
    replaced: d.replaced ?? [],
  };
}

/** Finds or creates the console user bound to `subject` (the Better Auth user id). Idempotent. */
export async function ensureConsoleAccount(input: EnsureConsoleAccountInput): Promise<ConsoleAccount> {
  const { json, status } = await call("POST", "/api/aedoxy/accounts/ensure", {
    subject: input.subject,
    email: input.email,
    display_name: input.displayName,
  });
  const parsed = ensureResponse.safeParse(json);
  if (!parsed.success) throw new NewApiError("invalid_response", "Bridge response has an unexpected shape", status);
  if (!parsed.data.success) throw new NewApiError("rejected", "Bridge rejected the request", status);

  const { user_id, username, created } = parsed.data.data;
  return { userId: user_id, username, created };
}
