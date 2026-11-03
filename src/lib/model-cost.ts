import { QUOTA_PER_USD } from "@/lib/format";
import type { ExpressionPrice, PricingItem } from "@/server/integrations/newapi";

/**
 * Credit cost of a model, from New API's own billing code (gateway-aedoxy):
 *
 *   ratio mode (quota_type 0), service/text_quota.go:
 *     quota = (prompt_tokens + completion_tokens * completion_ratio) * model_ratio * group_ratio
 *     $     = quota / QuotaPerUnit (500_000, common/constants.go)
 *     => USD per 1M input tokens  = model_ratio * group_ratio * 1_000_000 / 500_000
 *        USD per 1M output tokens = that * completion_ratio
 *   fixed price (quota_type 1), same file:
 *     quota = model_price * QuotaPerUnit * group_ratio  => USD per request = model_price * group_ratio
 *   billing_mode "tiered_expr" (relay/helper/price.go modelPriceHelperTiered) prices by expression. The expression is
 *   never parsed here: the gateway's billing engine evaluates it and serves the base USD per 1M tokens through
 *   GET /api/aedoxy/model-prices (fetchExpressionPrices). Here only the group ratio is applied. A model with no such
 *   price (old gateway, or an expression the engine skips) stays unsupported.
 *
 * Cache, image and audio ratios are left out; the figure is the plain text-token price. Never converted with an FX rate.
 */

/** The group whose ratio is shown: ordinary users (relay/helper/price.go HandleGroupRatio falls back to the user's own group, "default" for new accounts). */
export const PRICING_GROUP = "default";

export type CreditCost =
  | { kind: "tokens"; inputUsdPerM: number; outputUsdPerM: number; dynamic?: boolean }
  | { kind: "request"; usdPerRequest: number }
  | { kind: "unsupported"; reason: string };

const finite = (n: number) => Number.isFinite(n) && n >= 0;
/** Strips float noise such as 0.30000000000000004 without losing real precision. */
const clean = (n: number) => Number(n.toPrecision(12));

export function creditCost(item: PricingItem, groupRatio: Record<string, number>, expressionPrices?: ReadonlyMap<string, ExpressionPrice>): CreditCost {
  const byExpression = item.billing_mode === "tiered_expr" || (item.billing_expr ?? "").trim() !== "";
  const exprPrice = byExpression ? expressionPrices?.get(item.model_name) : undefined;
  if (byExpression && !exprPrice) return { kind: "unsupported", reason: "billing expression (no price from gateway)" };
  if (!item.enable_groups.includes(PRICING_GROUP) && !item.enable_groups.includes("all")) {
    return { kind: "unsupported", reason: `not enabled for group ${PRICING_GROUP}` };
  }
  // Same fallback as ratio_setting.GetGroupRatio: an unknown group costs x1.
  const group = groupRatio[PRICING_GROUP] ?? 1;
  if (!finite(group)) return { kind: "unsupported", reason: "invalid group ratio" };

  if (exprPrice) {
    if (!finite(exprPrice.inputUsdPerM) || !finite(exprPrice.outputUsdPerM)) return { kind: "unsupported", reason: "invalid expression price" };
    return { kind: "tokens", inputUsdPerM: clean(exprPrice.inputUsdPerM * group), outputUsdPerM: clean(exprPrice.outputUsdPerM * group), dynamic: exprPrice.dynamic };
  }

  if (item.quota_type === 1) {
    return finite(item.model_price) ? { kind: "request", usdPerRequest: clean(item.model_price * group) } : { kind: "unsupported", reason: "invalid model_price" };
  }
  if (item.quota_type === 0) {
    if (!finite(item.model_ratio) || !finite(item.completion_ratio)) return { kind: "unsupported", reason: "invalid ratio" };
    const input = (item.model_ratio * group * 1_000_000) / QUOTA_PER_USD;
    return { kind: "tokens", inputUsdPerM: clean(input), outputUsdPerM: clean(input * item.completion_ratio) };
  }
  return { kind: "unsupported", reason: `quota_type ${item.quota_type}` };
}
