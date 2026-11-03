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

/** `username` is a preference: the console falls back to a random name when it is taken, and that name is not stored here. */
export type EnsureConsoleAccountInput = { subject: string; email: string; displayName: string; username?: string };
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
  // PUT answers `data: null` (AdminUpdateSubscriptionPlan), POST answers the plan (AdminCreateSubscriptionPlan).
  z.object({ success: z.literal(true), data: z.object({ id: z.number().int().positive() }).nullish() }),
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

const groupsResponse = z.union([
  z.object({ success: z.literal(true), data: z.array(z.string()) }),
  z.object({ success: z.literal(false), message: z.string().optional() }),
]);

/** Group names defined in the console (GET /api/group/, admin auth), sorted, without blanks or duplicates. */
export async function listGroups(): Promise<string[]> {
  const { json, status } = await call("GET", "/api/group/");
  const parsed = groupsResponse.safeParse(json);
  if (!parsed.success) throw new NewApiError("invalid_response", "Bridge response has an unexpected shape", status);
  if (!parsed.data.success) throw new NewApiError("rejected", "Bridge rejected the request", status);
  return [...new Set(parsed.data.data.map((g) => g.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * One entry of GET /api/pricing (gateway-aedoxy model/pricing.go `Pricing`).
 * Only the fields the catalog needs; the rest is dropped by Zod.
 */
const pricingItem = z.object({
  model_name: z.string().min(1),
  vendor_id: z.number().int().optional(),
  /** 0 = billed per token (ratios), 1 = fixed price per request. */
  quota_type: z.number().int(),
  model_ratio: z.number(),
  model_price: z.number(),
  completion_ratio: z.number(),
  // Go marshals a nil slice as null; `.default` alone would drop such a model.
  enable_groups: z.array(z.string()).nullish().transform((v) => v ?? []),
  billing_mode: z.string().optional(),
  billing_expr: z.string().optional(),
});
export type PricingItem = z.infer<typeof pricingItem>;

const pricingEnvelope = z.object({
  success: z.boolean(),
  data: z.array(z.unknown()).default([]),
  vendors: z.array(z.object({ id: z.number().int(), name: z.string() })).nullish(),
  group_ratio: z.record(z.string(), z.number()).nullish(),
});

export type NewApiPricing = {
  items: PricingItem[];
  /** Vendor id -> display name. */
  vendors: Map<number, string>;
  groupRatio: Record<string, number>;
  /** Entries of `data` that did not match the expected shape and were left out. */
  skipped: number;
};

/**
 * GET /api/pricing. The endpoint is public, so the request goes out WITHOUT the
 * bridge token: a token would make New API answer for the service account's
 * group instead of an ordinary visitor. Throws NewApiError on any failure.
 */
export async function fetchPricing(): Promise<NewApiPricing> {
  const baseUrl = env.NEWAPI_INTERNAL_URL ?? env.NEWAPI_PUBLIC_URL;
  let res: Response;
  try {
    res = await fetch(new URL("/api/pricing", baseUrl), { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new NewApiError(timedOut ? "timeout" : "network", timedOut ? "Pricing request timed out" : "Pricing request failed");
  }
  if (!res.ok) throw new NewApiError("http", `Pricing returned HTTP ${res.status}`, res.status);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new NewApiError("invalid_response", "Pricing returned invalid JSON", res.status);
  }
  const envelope = pricingEnvelope.safeParse(json);
  if (!envelope.success) throw new NewApiError("invalid_response", "Pricing response has an unexpected shape", res.status);
  if (!envelope.data.success) throw new NewApiError("rejected", "Pricing request was rejected", res.status);

  const items: PricingItem[] = [];
  for (const raw of envelope.data.data) {
    const item = pricingItem.safeParse(raw);
    if (item.success) items.push(item.data);
  }
  return {
    items,
    vendors: new Map((envelope.data.vendors ?? []).map((v) => [v.id, v.name])),
    groupRatio: envelope.data.group_ratio ?? {},
    skipped: envelope.data.data.length - items.length,
  };
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
    ...(input.username ? { username: input.username } : {}),
  });
  const parsed = ensureResponse.safeParse(json);
  if (!parsed.success) throw new NewApiError("invalid_response", "Bridge response has an unexpected shape", status);
  if (!parsed.data.success) throw new NewApiError("rejected", "Bridge rejected the request", status);

  const { user_id, username, created } = parsed.data.data;
  return { userId: user_id, username, created };
}

const statusResponse = z.union([
  z.object({
    success: z.literal(true),
    data: z.object({ user_id: z.number().int().positive(), enabled: z.boolean(), changed: z.boolean() }),
  }),
  z.object({ success: z.literal(false), message: z.string().optional() }),
]);

export type ConsoleAccountStatus = { userId: number; enabled: boolean; changed: boolean };

/**
 * Enables or disables the console user bound to `subject`. Idempotent (`changed` is false when nothing moved).
 * HTTP 404 means the subject was never ensured and 409 means the console user is an Admin/Root (protected);
 * both surface as NewApiError kind "http" with `status` set, so callers can tell them apart.
 */
export async function setConsoleAccountEnabled(subject: string, enabled: boolean): Promise<ConsoleAccountStatus> {
  const { json, status } = await call("POST", "/api/aedoxy/accounts/status", { subject, enabled });
  const parsed = statusResponse.safeParse(json);
  if (!parsed.success) throw new NewApiError("invalid_response", "Bridge response has an unexpected shape", status);
  if (!parsed.data.success) throw new NewApiError("rejected", "Bridge rejected the request", status);

  const { user_id, enabled: now, changed } = parsed.data.data;
  return { userId: user_id, enabled: now, changed };
}
