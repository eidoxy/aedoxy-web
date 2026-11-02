import { createHmac, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { vi } from "vitest";
import { db } from "@/server/db/client";
import { creditPool, plans, user } from "@/server/db/schema";

/** Integration test plumbing: real Postgres (`aedoxy_test`), fake Poketo and fake New API over `fetch`. */

export const WEBHOOK_SECRET = "whsec_unit";
export const QUOTA_PER_DOLLAR = 500_000;

/** Fails hard (never skips) when the test database is not configured, and refuses any database not named *_test. */
export async function prepareDatabase() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      "DATABASE_URL_TEST is not set. Integration tests need a dedicated Postgres database, " +
        "e.g. postgres://aedoxy:aedoxy_dev@127.0.0.1:54320/aedoxy_test",
    );
  }
  const dbName = new URL(url).pathname.replace(/^\//, "");
  if (!dbName.endsWith("_test")) throw new Error(`Refusing to run integration tests on database "${dbName}": its name must end with _test`);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../drizzle", import.meta.url)) });
}

/** Empties every table in the public schema (the drizzle migration journal lives in another schema). */
export async function resetDatabase() {
  const { rows } = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public'`);
  const names = rows.map((r) => `"${r.tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
}

let userSeq = 0;

export async function seedUser(overrides: Partial<typeof user.$inferInsert> = {}) {
  userSeq++;
  const row = {
    id: randomUUID(),
    name: `Tester ${userSeq}`,
    email: `tester${userSeq}-${randomUUID().slice(0, 8)}@example.com`,
    emailVerified: true,
    newapiUserId: 1000 + userSeq,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
  await db.insert(user).values(row);
  return row;
}

export async function seedPlan(overrides: Partial<typeof plans.$inferInsert> = {}) {
  const [row] = await db
    .insert(plans)
    .values({
      name: "Bulanan $20",
      slug: `bulanan-${randomUUID().slice(0, 8)}`,
      period: "monthly",
      durationUnit: "day",
      durationValue: 30,
      creditQuota: 20 * QUOTA_PER_DOLLAR,
      priceIdr: 55_000,
      newapiPlanId: 7,
      ...overrides,
      // A plan with a console id is seeded as synced unless the test says otherwise.
      syncedVersion: overrides.syncedVersion !== undefined ? overrides.syncedVersion : overrides.newapiPlanId === null ? null : 1,
    })
    .returning();
  return row;
}

export async function seedPool(totalQuota: number) {
  await db.insert(creditPool).values({ id: 1, totalQuota });
}

export async function readPool() {
  const [row] = await db.select().from(creditPool);
  return row;
}

type FakeInvoice = { id: string; status: string; amount: number; referenceId: string; paymentUrl: string };

/** Replaces global fetch. Any URL other than the fake Poketo and New API hosts throws, so no test can hit the network. */
export function installFakeServers() {
  const invoices = new Map<string, FakeInvoice>(); // keyed by referenceId
  const subscriptions = new Map<number, unknown[]>(); // New API user id -> data array
  const newapiPlans = new Map<number, Record<string, unknown>>();
  const fulfilled = new Map<string, { user_subscription_id: number; end_time: number; replaced: { id: number; remaining: number }[] }>();
  const state = {
    failCreate: false,
    /** Cancel-invoice calls answer HTTP 500. */
    failCancel: false,
    calls: [] as string[],
    /** Number of upcoming fulfill calls that answer HTTP 500. */
    failFulfill: 0,
    /** Number of upcoming plan upserts that answer success:false. */
    rejectPlan: 0,
    /** Group names the console lists; null makes GET /api/group/ answer HTTP 500. */
    groups: ["default", "vip"] as string[] | null,
    /** trade_no -> subscriptions the bridge reports as replaced by that purchase. */
    replacedBy: {} as Record<string, { id: number; remaining: number }[]>,
    fulfillBodies: [] as Record<string, unknown>[],
  };

  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    state.calls.push(`${method} ${url.host}${url.pathname}`);

    if (url.host === "poketo.test") {
      const path = url.pathname.replace("/api/v1", "");
      if (method === "POST" && path === "/invoices") {
        if (state.failCreate) return json({ error: { code: "internal_error", message: "x" } }, 500);
        const body = JSON.parse(String(init?.body));
        const existing = invoices.get(body.referenceId);
        if (existing) return json({ data: existing });
        const invoice: FakeInvoice = {
          id: `INV-PKT-${invoices.size + 1}`,
          status: "pending",
          amount: body.amount,
          referenceId: body.referenceId,
          paymentUrl: `https://pay.poketo.test/inv/${body.referenceId}`,
        };
        invoices.set(body.referenceId, invoice);
        return json({ data: invoice }, 201);
      }
      const cancel = path.match(/^\/invoices\/([^/]+)\/cancel$/);
      if (method === "POST" && cancel) {
        if (state.failCancel) return json({ error: { code: "internal_error", message: "x" } }, 500);
        const ref = decodeURIComponent(cancel[1]);
        const found = invoices.get(ref) ?? [...invoices.values()].find((i) => i.id === ref);
        if (!found) return json({ error: { code: "not_found", message: "x" } }, 404);
        if (found.status === "paid") return json({ error: { code: "invoice_not_cancellable", message: "x" } }, 409);
        found.status = "cancelled";
        return json({ data: found });
      }
      const match = path.match(/^\/invoices\/([^/]+)$/);
      if (method === "GET" && match) {
        const ref = decodeURIComponent(match[1]);
        const found = invoices.get(ref) ?? [...invoices.values()].find((i) => i.id === ref);
        return found ? json({ data: found }) : json({ error: { code: "not_found", message: "x" } }, 404);
      }
    }

    if (url.host === "newapi.test") {
      const match = url.pathname.match(/^\/api\/subscription\/admin\/users\/(\d+)\/subscriptions$/);
      if (method === "GET" && match) return json({ success: true, message: "", data: subscriptions.get(Number(match[1])) ?? [] });

      const planPath = url.pathname.match(/^\/api\/subscription\/admin\/plans(?:\/(\d+))?$/);
      if (planPath && (method === "POST" || method === "PUT")) {
        if (state.rejectPlan > 0) {
          state.rejectPlan--;
          return json({ success: false, message: "no" });
        }
        const { plan } = JSON.parse(String(init?.body)) as { plan: Record<string, unknown> };
        const id = planPath[1] ? Number(planPath[1]) : newapiPlans.size + 100;
        newapiPlans.set(id, plan);
        // Real console: POST returns the created plan, PUT returns data null.
        return json({ success: true, message: "", data: method === "POST" ? { id, ...plan } : null });
      }

      if (method === "GET" && url.pathname === "/api/group/") {
        return state.groups ? json({ success: true, message: "", data: state.groups }) : json({ success: false, message: "down" }, 500);
      }

      if (method === "POST" && url.pathname === "/api/aedoxy/fulfill") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        state.fulfillBodies.push(body);
        if (state.failFulfill > 0) {
          state.failFulfill--;
          return json({ success: false, message: "console down" }, 500);
        }
        const tradeNo = String(body.trade_no);
        const existing = fulfilled.get(tradeNo);
        if (existing) return json({ success: true, message: "", data: { already_fulfilled: true, ...existing } });
        const result = {
          user_subscription_id: 500 + fulfilled.size,
          end_time: Math.floor(Date.now() / 1000) + 30 * 86_400,
          replaced: state.replacedBy[tradeNo] ?? [],
        };
        fulfilled.set(tradeNo, result);
        return json({ success: true, message: "", data: { already_fulfilled: false, ...result } });
      }
    }

    throw new Error(`Unexpected fetch in test: ${method} ${url.host}${url.pathname}`);
  });

  return { invoices, subscriptions, newapiPlans, fulfilled, state };
}

/** Signs `rawBody` like Poketo does and builds the Request the route handler receives. */
export function webhookRequest(
  rawBody: string,
  opts: { eventId?: string; event?: string; secret?: string; t?: number; signature?: string } = {},
) {
  const t = opts.t ?? Math.floor(Date.now() / 1000);
  const hex = createHmac("sha256", opts.secret ?? WEBHOOK_SECRET).update(`${t}.${rawBody}`).digest("hex");
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "poketo-signature": opts.signature ?? `t=${t},v1=${hex}`,
    "poketo-event": opts.event ?? "invoice.paid",
    "poketo-event-id": opts.eventId ?? `evt_${randomUUID()}`,
    "poketo-delivery": `whd_${randomUUID()}`,
  };
  return new Request("https://aedoxy.test/api/webhooks/poketo", { method: "POST", headers, body: rawBody });
}

/** A plausible invoice.paid body (the real shape is not fully documented). */
export const paidBody = (referenceId: string) => JSON.stringify({ type: "invoice.paid", data: { referenceId } });
