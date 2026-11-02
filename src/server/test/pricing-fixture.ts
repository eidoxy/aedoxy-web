/**
 * A GET /api/pricing body in the shape of gateway-aedoxy `controller/pricing.go` (GetPricing) over
 * `model/pricing.go` (Pricing). Ratios are New API's own defaults (setting/ratio_setting/model_ratio.go:
 * "gpt-4o: 1.25 // $2.5 / 1M tokens"), so the expected dollar figures can be checked against that file's comments.
 * Extra fields New API sends (owner_by, supported_endpoint_types, ...) are kept to prove they are ignored.
 */
export const pricingBody = {
  success: true,
  data: [
    {
      model_name: "gpt-4o",
      description: "",
      icon: "OpenAI",
      tags: "",
      vendor_id: 1,
      quota_type: 0,
      model_ratio: 1.25,
      model_price: 0,
      owner_by: "",
      completion_ratio: 4,
      cache_ratio: 0.5,
      enable_groups: ["default", "vip"],
      supported_endpoint_types: ["openai"],
    },
    {
      model_name: "claude-3-5-sonnet-20241022",
      vendor_id: 2,
      quota_type: 0,
      model_ratio: 1.5,
      model_price: 0,
      completion_ratio: 5,
      enable_groups: ["all"],
      supported_endpoint_types: ["anthropic"],
    },
    {
      model_name: "mj_imagine",
      vendor_id: 3,
      quota_type: 1,
      model_ratio: 0,
      model_price: 0.1,
      completion_ratio: 0,
      enable_groups: ["default"],
      supported_endpoint_types: ["midjourney-proxy"],
    },
    {
      model_name: "tiered-model",
      vendor_id: 1,
      quota_type: 0,
      model_ratio: 2,
      model_price: 0,
      completion_ratio: 3,
      enable_groups: ["default"],
      billing_mode: "tiered_expr",
      billing_expr: "tier(p, c)",
    },
    {
      model_name: "vip-only",
      quota_type: 0,
      model_ratio: 1,
      model_price: 0,
      completion_ratio: 1,
      enable_groups: ["vip"],
    },
    { model_name: "broken", quota_type: "zero" },
  ],
  vendors: [
    { id: 1, name: "OpenAI", description: "", icon: "OpenAI" },
    { id: 2, name: "Anthropic", icon: "Claude" },
    { id: 3, name: "Midjourney" },
  ],
  group_ratio: { default: 1, vip: 0.8 },
  usable_group: { default: "Default", vip: "VIP" },
  supported_endpoint: {},
  auto_groups: [],
  pricing_version: "a42d372ccf0b5dd13ecf71203521f9d2",
};
