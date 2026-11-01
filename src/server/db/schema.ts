/**
 * DB "aedoxy" (TRD section 6). Better Auth tables (user, session, account,
 * verification, twoFactor, OAuth provider) are added in the auth wave, together
 * with user.newapi_user_id / role / feed_visibility. Until then `user_id`
 * columns are plain text without a foreign key.
 *
 * Money is whole rupiah in bigint. Credit is bigint in New API quota units
 * (500_000 per $1 by default). Dollar values exist for display only.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const quota = (name: string) => bigint(name, { mode: "number" });
const rupiah = (name: string) => bigint(name, { mode: "number" });

export const planPeriod = pgEnum("plan_period", ["weekly", "monthly", "custom"]);
export const durationUnit = pgEnum("duration_unit", ["hour", "day"]);
export const promoKind = pgEnum("promo_kind", ["percent", "fixed"]);
export const redemptionStatus = pgEnum("redemption_status", ["reserved", "used", "released"]);
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
  "refunded",
]);
export const fulfillmentStatus = pgEnum("fulfillment_status", [
  "queued",
  "retrying",
  "succeeded",
  "dead",
]);
export const poolLedgerType = pgEnum("pool_ledger_type", [
  "admin_adjust",
  "reserve",
  "release",
  "sell",
  "late_sell",
  "expire_return",
  "replace_return",
  "refund_return",
]);
export const fxMode = pgEnum("fx_mode", ["manual", "auto"]);

/** Single row (id = 1). */
export const creditPool = pgTable(
  "credit_pool",
  {
    id: integer("id").primaryKey().default(1),
    totalQuota: quota("total_quota").notNull().default(0),
    reservedQuota: quota("reserved_quota").notNull().default(0),
    soldQuota: quota("sold_quota").notNull().default(0),
    lowThresholdQuota: quota("low_threshold_quota").notNull().default(0),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("credit_pool_single_row", sql`${t.id} = 1`),
    check("credit_pool_nonneg", sql`${t.reservedQuota} >= 0 and ${t.soldQuota} >= 0`),
  ],
);

export const plans = pgTable(
  "plans",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    /** F05 form field "subjudul"; not in the TRD column list. */
    subtitle: text("subtitle"),
    slug: text("slug").notNull().unique(),
    period: planPeriod("period").notNull(),
    durationUnit: durationUnit("duration_unit").notNull(),
    durationValue: integer("duration_value").notNull(),
    creditQuota: quota("credit_quota").notNull(),
    priceIdr: rupiah("price_idr").notNull(),
    compareAtPriceIdr: rupiah("compare_at_price_idr"),
    fairUse: boolean("fair_use").notNull().default(false),
    upgradeGroup: text("upgrade_group"),
    /** 0 = unlimited. */
    maxPurchasePerUser: integer("max_purchase_per_user").notNull().default(0),
    /** Null = unlimited. */
    stockLimit: integer("stock_limit"),
    soldCount: integer("sold_count").notNull().default(0),
    saleStartsAt: ts("sale_starts_at"),
    saleEndsAt: ts("sale_ends_at"),
    badge: text("badge"),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    newapiPlanId: integer("newapi_plan_id"),
    syncedAt: ts("synced_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("plans_price_min", sql`${t.priceIdr} >= 10000`),
    check("plans_credit_positive", sql`${t.creditQuota} > 0`),
    check("plans_duration_positive", sql`${t.durationValue} > 0`),
  ],
);

export const promotions = pgTable(
  "promotions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    code: text("code"),
    kind: promoKind("kind").notNull(),
    value: integer("value").notNull(),
    /** Empty = all plans. */
    planIds: integer("plan_ids").array().notNull().default(sql`'{}'::integer[]`),
    startsAt: ts("starts_at"),
    endsAt: ts("ends_at"),
    maxRedemptions: integer("max_redemptions"),
    redeemedCount: integer("redeemed_count").notNull().default(0),
    perUserLimit: integer("per_user_limit"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("promotions_code_lower_uq").on(sql`lower(${t.code})`)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tradeNo: text("trade_no").notNull().unique(),
    userId: text("user_id").notNull(),
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id),
    /** Name, credit and duration at purchase time. */
    planSnapshot: jsonb("plan_snapshot").notNull(),
    creditQuota: quota("credit_quota").notNull(),
    listPriceIdr: rupiah("list_price_idr").notNull(),
    discountIdr: rupiah("discount_idr").notNull().default(0),
    amountIdr: rupiah("amount_idr").notNull(),
    promotionId: integer("promotion_id").references(() => promotions.id),
    status: orderStatus("status").notNull().default("pending"),
    poketoInvoiceId: text("poketo_invoice_id"),
    paymentUrl: text("payment_url"),
    paymentMethod: text("payment_method"),
    expiresAt: ts("expires_at").notNull(),
    paidAt: ts("paid_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("orders_user_status_idx").on(t.userId, t.status),
    index("orders_status_expires_idx").on(t.status, t.expiresAt),
    check("orders_trade_no_format", sql`${t.tradeNo} ~ '^[A-Za-z0-9._:-]{1,64}$'`),
    // QRIS limits (PRD F01): Rp10.000 to Rp10.000.000 per transaction.
    check("orders_amount_range", sql`${t.amountIdr} between 10000 and 10000000`),
  ],
);

export const promotionRedemptions = pgTable("promotion_redemptions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  promotionId: integer("promotion_id")
    .notNull()
    .references(() => promotions.id),
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id),
  userId: text("user_id").notNull(),
  status: redemptionStatus("status").notNull().default("reserved"),
});

export const poolLedger = pgTable("pool_ledger", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  type: poolLedgerType("type").notNull(),
  /** Signed change in quota units. */
  delta: quota("delta").notNull(),
  orderId: uuid("order_id").references(() => orders.id),
  actorId: text("actor_id"),
  note: text("note"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const fulfillments = pgTable(
  "fulfillments",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id),
    status: fulfillmentStatus("status").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: ts("next_attempt_at").notNull().defaultNow(),
    lastError: text("last_error"),
    /** { user_subscription_id, end_time } from the bridge response. */
    newapiRef: jsonb("newapi_ref"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("fulfillments_status_next_idx").on(t.status, t.nextAttemptAt)],
);

export const subscriptionGrants = pgTable(
  "subscription_grants",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    orderId: uuid("order_id")
      .notNull()
      .unique()
      .references(() => orders.id),
    newapiUserId: integer("newapi_user_id").notNull(),
    newapiUserSubscriptionId: integer("newapi_user_subscription_id").notNull(),
    creditQuota: quota("credit_quota").notNull(),
    endsAt: ts("ends_at").notNull(),
    returnedQuota: quota("returned_quota").notNull().default(0),
    reconciledAt: ts("reconciled_at"),
  },
  (t) => [index("subscription_grants_reconcile_idx").on(t.reconciledAt, t.endsAt)],
);

/** Single row (id = 1). */
export const fxSettings = pgTable(
  "fx_settings",
  {
    id: integer("id").primaryKey().default(1),
    mode: fxMode("mode").notNull().default("auto"),
    manualRateIdr: numeric("manual_rate_idr", { precision: 14, scale: 4 }),
    roundingStepIdr: integer("rounding_step_idr").notNull().default(1),
    refreshHours: integer("refresh_hours").notNull().default(12),
    staleAfterHours: integer("stale_after_hours").notNull().default(72),
    divergenceAlertPct: numeric("divergence_alert_pct", { precision: 5, scale: 2 })
      .notNull()
      .default("2"),
    showConversion: boolean("show_conversion").notNull().default(true),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [check("fx_settings_single_row", sql`${t.id} = 1`)],
);

export const fxRates = pgTable("fx_rates", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  source: text("source").notNull(),
  midRate: numeric("mid_rate", { precision: 14, scale: 4 }).notNull(),
  sourceDate: date("source_date", { mode: "string" }).notNull(),
  fetchedAt: ts("fetched_at").notNull().defaultNow(),
  applied: boolean("applied").notNull().default(false),
});

export const webhookEvents = pgTable("webhook_events", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  deliveryId: text("delivery_id"),
  receivedAt: ts("received_at").notNull().defaultNow(),
  processedAt: ts("processed_at"),
  result: text("result"),
});

export const adminAuditLog = pgTable("admin_audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  target: text("target"),
  before: jsonb("before"),
  after: jsonb("after"),
  ip: text("ip"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Catalog metadata New API does not keep (F08). */
export const modelMeta = pgTable("model_meta", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  modelName: text("model_name").notNull().unique(),
  provider: text("provider").notNull(),
  contextIn: integer("context_in"),
  contextOut: integer("context_out"),
  capabilities: text("capabilities").array().notNull().default(sql`'{}'::text[]`),
  officialInputUsdPerM: numeric("official_input_usd_per_m", { precision: 12, scale: 4 }),
  officialOutputUsdPerM: numeric("official_output_usd_per_m", { precision: 12, scale: 4 }),
  visible: boolean("visible").notNull().default(true),
});
