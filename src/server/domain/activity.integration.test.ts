import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The route reads request headers and the cached catalog wrapper; both need Next's runtime, so they are replaced here.
const headerBag = vi.hoisted(() => ({ ip: "198.51.100.7" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": headerBag.ip }) }));
vi.mock("@/server/catalog", async () => {
  const { getPublicActivity } = await import("./activity");
  return { getActivity: () => getPublicActivity() };
});

import { GET } from "@/app/api/public/activity/route";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, fulfillments, orders, user } from "@/server/db/schema";
import { prepareDatabase, resetDatabase, seedPlan, seedUser } from "@/server/test/helpers";
import { adminHideActivityItem, adminSaveActivitySettings, getPublicActivity, listAdminActivity, setShowActivity } from "./activity";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const actor = { id: "admin-1", ip: null };
const HOUR = 3_600_000;

type PlanRow = Awaited<ReturnType<typeof seedPlan>>;
type UserRow = Awaited<ReturnType<typeof seedUser>>;

/** A paid order whose activation succeeded, `hoursAgo` hours ago. */
async function sale(u: UserRow, plan: PlanRow, hoursAgo: number, opts: { fulfillment?: "succeeded" | "queued" | null; status?: "paid" | "pending" } = {}) {
  const [o] = await db
    .insert(orders)
    .values({
      tradeNo: `ADX-20261102-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      userId: u.id,
      planId: plan.id,
      planSnapshot: { name: plan.name, period: plan.period },
      creditQuota: plan.creditQuota,
      listPriceIdr: plan.priceIdr,
      amountIdr: plan.priceIdr,
      status: opts.status ?? "paid",
      paidAt: new Date(Date.now() - hoursAgo * HOUR),
      expiresAt: new Date(),
    })
    .returning();
  if (opts.fulfillment !== null) await db.insert(fulfillments).values({ orderId: o.id, status: opts.fulfillment ?? "succeeded" });
  return o;
}

/** Four buyers with distinct names, one sale each. */
async function fourSales() {
  const plan = await seedPlan();
  const names = ["Rama Adi", "Budi Santoso", "Citra", "Dewi Lestari"];
  const users = await Promise.all(names.map((name) => seedUser({ name })));
  const made = [];
  for (const [i, u] of users.entries()) made.push(await sale(u, plan, i + 1));
  return { plan, users, made };
}

describe("public activity feed", () => {
  it("lists only paid + succeeded orders, masked, with the plan label and a minute-rounded time", async () => {
    const { plan, users } = await fourSales();
    await sale(users[0], plan, 0.5, { fulfillment: "queued" }); // not activated yet
    await sale(users[1], plan, 0.5, { status: "pending", fulfillment: null });

    const items = await getPublicActivity();
    expect(items.map((i) => i.label)).toEqual(["R•••i", "B•••o", "C•••a", "D•••i"]);
    expect(items[0]).toMatchObject({ plan: "Bulanan $20" });
    expect(items[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/);
  });

  it("shows nothing in the JSON that identifies a person or a price", async () => {
    await fourSales();
    const body = await (await GET()).json();
    expect(body).toHaveLength(4);
    for (const item of body) expect(Object.keys(item).sort()).toEqual(["at", "label", "plan"]);
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/@|example\.com|55\.?000|Rp|tester/i);
  });

  it("keeps one item per user (the newest) and hides the feed below 3 users", async () => {
    const plan = await seedPlan();
    const [a, b] = await Promise.all([seedUser({ name: "Alice" }), seedUser({ name: "Bobby" })]);
    await sale(a, plan, 1);
    await sale(a, plan, 2);
    await sale(b, plan, 3);
    expect(await getPublicActivity()).toEqual([]);

    const c = await seedUser({ name: "Carla" });
    await sale(c, plan, 4);
    const items = await getPublicActivity();
    expect(items.map((i) => i.label)).toEqual(["A•••e", "B•••y", "C•••a"]);
  });

  it("drops sales older than 7 days", async () => {
    const { plan, users } = await fourSales();
    await sale(users[0], plan, 24 * 8); // old, and the same user's newer sale already exists
    const stale = await seedUser({ name: "Zainal" });
    await sale(stale, plan, 24 * 8);
    expect((await getPublicActivity()).map((i) => i.label)).not.toContain("Z•••l");
    expect(await getPublicActivity()).toHaveLength(4);
  });

  it("calls short names and emoji safely", async () => {
    const plan = await seedPlan();
    const names = ["Al", "😀😀😀", "Ra"];
    for (const [i, name] of names.entries()) await sale(await seedUser({ name }), plan, i + 1);
    expect((await getPublicActivity()).map((i) => i.label)).toEqual(["Pengguna", "😀•••😀", "Pengguna"]);
  });

  it("omits users who opted out, and brings them back when they opt in", async () => {
    const { users } = await fourSales();
    await setShowActivity(users[0].id, false);
    expect((await getPublicActivity()).map((i) => i.label)).toEqual(["B•••o", "C•••a", "D•••i"]);
    await setShowActivity(users[0].id, true);
    expect(await getPublicActivity()).toHaveLength(4);
    expect((await db.select({ s: user.showActivity }).from(user).where(eq(user.id, users[0].id)))[0].s).toBe(true);
  });
});

describe("admin controls", () => {
  it("global switch empties the feed and is audited", async () => {
    await fourSales();
    await adminSaveActivitySettings(actor, { enabled: false, planIds: null });
    expect(await getPublicActivity()).toEqual([]);
    const admin = await listAdminActivity();
    expect(admin.settings.enabled).toBe(false);
    expect(admin.items).toHaveLength(4); // the admin still sees what would show

    const [audit] = await db.select().from(adminAuditLog);
    expect(audit).toMatchObject({ action: "activity.settings", before: { enabled: true, planIds: null }, after: { enabled: false, planIds: null } });
  });

  it("only the chosen plans appear; an empty choice shows none", async () => {
    const { plan } = await fourSales();
    const promo = await seedPlan({ name: "Promo $5", slug: "promo-5" });
    for (const name of ["Eka", "Fajar", "Gita"]) await sale(await seedUser({ name }), promo, 1);
    expect(await getPublicActivity()).toHaveLength(7);

    await adminSaveActivitySettings(actor, { enabled: true, planIds: [plan.id] });
    expect(await getPublicActivity()).toHaveLength(4);
    await adminSaveActivitySettings(actor, { enabled: true, planIds: [] });
    expect(await getPublicActivity()).toEqual([]);
  });

  it("hiding an item removes it from the feed once, and audits it", async () => {
    const { made } = await fourSales();
    await adminHideActivityItem(actor, made[0].id);
    await adminHideActivityItem(actor, made[0].id);
    expect((await getPublicActivity()).map((i) => i.label)).toEqual(["B•••o", "C•••a", "D•••i"]);
    expect((await listAdminActivity()).settings.hiddenOrderIds).toEqual([made[0].id]);
    expect(await db.select().from(adminAuditLog)).toHaveLength(1);
    await expect(adminHideActivityItem(actor, "not-a-uuid")).rejects.toThrow("Item tidak valid.");
    await expect(adminHideActivityItem(actor, "00000000-0000-4000-8000-000000000000")).rejects.toThrow("Order tidak ditemukan.");
  });
});

describe("GET /api/public/activity", () => {
  it("answers 429 after 30 requests per minute from one IP, and not for another IP", async () => {
    headerBag.ip = "203.0.113.50";
    for (let i = 0; i < 30; i++) expect((await GET()).status).toBe(200);
    const limited = await GET();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    headerBag.ip = "203.0.113.51";
    const ok = await GET();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toContain("s-maxage=30");
  });
});
