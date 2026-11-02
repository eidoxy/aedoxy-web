import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { parsePlanForm, type PlanInput } from "@/lib/schemas/plan";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, orders, plans } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, resetDatabase, seedPlan, seedPool, seedUser } from "@/server/test/helpers";
import {
  assertUpgradeGroupAllowed,
  createPlan,
  duplicatePlan,
  listAdminPlans,
  movePlan,
  pushSortOrdersBestEffort,
  setPlanEnabled,
  setPlanPrice,
  syncedFieldsChanged,
  syncPlansBestEffort,
  updatePlan,
} from "./admin-plans";
import { AdminError } from "./audit";
import { listGroups } from "@/server/integrations/newapi";
import { createPlanOrder, OrderError } from "./orders";
import { retryUnsyncedPlans, syncPlan } from "./plan-sync";

let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
});
afterEach(() => vi.unstubAllGlobals());

const actor = { id: "admin-1", ip: "198.51.100.4" };

function input(overrides: Record<string, string> = {}): PlanInput {
  const r = parsePlanForm({ name: "Bulanan $20", period: "monthly", creditUsd: "20", priceIdr: "55000", maxPurchasePerUser: "0", enabled: "on", ...overrides });
  if (!r.success) throw new Error(`bad test input: ${r.error.message}`);
  return r.data;
}

const rowOf = async (id: number) => (await db.select().from(plans).where(eq(plans.id, id)))[0];
const audits = (action: string) => db.select().from(adminAuditLog).where(eq(adminAuditLog.action, action));

/** Buying as a user is the real test of "sellable". */
async function tryBuy(planId: number) {
  const u = await seedUser();
  try {
    await createPlanOrder({ userId: u.id, planId });
    return "bought";
  } catch (err) {
    if (err instanceof OrderError) return err.code;
    throw err;
  }
}

async function paidOrder(planId: number) {
  const u = await seedUser();
  const p = await rowOf(planId);
  await db.insert(orders).values({
    tradeNo: `ADX-TEST-${planId}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    userId: u.id,
    planId,
    planSnapshot: {},
    creditQuota: p.creditQuota,
    listPriceIdr: p.priceIdr,
    amountIdr: p.priceIdr,
    status: "paid",
    expiresAt: new Date(),
  });
}

describe("syncedFieldsChanged", () => {
  const base = { name: "A", subtitle: null, durationUnit: "day", durationValue: 30, creditQuota: 1, upgradeGroup: null, maxPurchasePerUser: 0, enabled: true, sortOrder: 1 } as const;
  it("is false for nothing and true for each mirrored field", () => {
    expect(syncedFieldsChanged(base, { ...base })).toBe(false);
    const reordered = { ...base, sortOrder: 2 };
    expect(syncedFieldsChanged(base, reordered)).toBe(false); // display order is not mirrored
    for (const change of [{ name: "B" }, { subtitle: "x" }, { durationValue: 7 }, { creditQuota: 2 }, { upgradeGroup: "g" }, { maxPurchasePerUser: 1 }, { enabled: false }]) {
      expect(syncedFieldsChanged(base, { ...base, ...change })).toBe(true);
    }
  });
});

describe("createPlan", () => {
  it("saves the plan, audits it, and keeps it off sale until it is synced", async () => {
    await seedPool(100_000_000);
    const plan = await createPlan(actor, input());

    expect(plan).toMatchObject({ slug: "bulanan-20", creditQuota: 10_000_000, durationValue: 30, newapiPlanId: null, syncedVersion: null, sortOrder: 1 });
    const [audit] = await audits("plan.create");
    expect(audit).toMatchObject({ actorId: "admin-1", target: `plan:${plan.id}`, ip: "198.51.100.4" });
    expect(await tryBuy(plan.id)).toBe("PLAN_UNAVAILABLE");

    expect(await syncPlansBestEffort([plan.id])).toEqual([{ id: plan.id, ok: true }]);
    expect(await tryBuy(plan.id)).toBe("bought");
  });

  it("gives a second plan with the same name its own slug", async () => {
    const a = await createPlan(actor, input());
    const b = await createPlan(actor, input());
    expect(a.slug).toBe("bulanan-20");
    expect(b.slug).toMatch(/^bulanan-20-[0-9a-f]{6}$/);
    expect(b.sortOrder).toBe(2);
  });
});

describe("a failed sync keeps the plan off sale", () => {
  it("an edit to a mirrored field makes the plan unsellable until a sync succeeds", async () => {
    await seedPool(100_000_000);
    const p = await seedPlan({ newapiPlanId: 7 });
    expect(await tryBuy(p.id)).toBe("bought");

    fake.state.rejectPlan = 1;
    const { needsSync } = await updatePlan(actor, p.id, input({ name: "Bulanan $20 baru" }));
    expect(needsSync).toBe(true);
    expect(await syncPlansBestEffort([p.id])).toEqual([{ id: p.id, ok: false }]);

    const stale = await rowOf(p.id);
    expect(stale.fieldsVersion).toBe(2);
    expect(stale.syncedVersion).toBe(1);
    expect(await tryBuy(p.id)).toBe("PLAN_UNAVAILABLE");

    expect(await retryUnsyncedPlans()).toMatchObject({ synced: 1, failed: [] });
    expect(await tryBuy(p.id)).toBe("bought");
    expect(fake.newapiPlans.get(7)).toMatchObject({ title: "Bulanan $20 baru" });
  });

  it("updating a plan that already has a New API id syncs when the console answers PUT with data null", async () => {
    const p = await seedPlan({ newapiPlanId: 7 });
    await updatePlan(actor, p.id, input({ name: "Baru", creditUsd: "30" }), { confirmCreditChange: true });
    expect(await syncPlansBestEffort([p.id])).toEqual([{ id: p.id, ok: true }]);
    const row = await rowOf(p.id);
    expect(row.fieldsVersion).toBe(2);
    expect(row.syncedVersion).toBe(row.fieldsVersion);
    expect(row.newapiPlanId).toBe(7);
  });

  it("an edit made while a sync is running leaves the plan unsynced", async () => {
    const p = await seedPlan({ newapiPlanId: 7 });
    const real = globalThis.fetch;
    let edited = false;
    vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
      if (!edited && String(url).includes("/admin/plans")) {
        edited = true;
        await updatePlan(actor, p.id, input({ creditUsd: "30" }), { confirmCreditChange: true });
      }
      return real(url, init);
    });

    await syncPlan(p.id);

    const after = await rowOf(p.id);
    expect(after.syncedVersion).toBe(1);
    expect(after.fieldsVersion).toBe(2);
    vi.stubGlobal("fetch", real);
    await syncPlan(p.id);
    expect((await rowOf(p.id)).syncedVersion).toBe(2);
  });

  it("a price or compare-at change alone does not bump the version or need a sync", async () => {
    const p = await seedPlan();
    const r = await updatePlan(actor, p.id, input({ name: p.name, priceIdr: "60000", compareAtPriceIdr: "80000", badge: "Promo", stockLimit: "10", sortOrder: String(p.sortOrder) }));
    expect(r.needsSync).toBe(false);
    expect((await rowOf(p.id)).fieldsVersion).toBe(1);

    await setPlanPrice(actor, p.id, 45_000);
    const after = await rowOf(p.id);
    expect(after).toMatchObject({ priceIdr: 45_000, fieldsVersion: 1, syncedVersion: 1 });
    expect(fake.state.calls.filter((c) => c.includes("/admin/plans"))).toHaveLength(0);
    const [audit] = await audits("plan.set_price");
    expect(audit).toMatchObject({ before: { priceIdr: 60_000 }, after: { priceIdr: 45_000 } });
  });
});

describe("price edits", () => {
  it("do not change the amount of an order that is already pending", async () => {
    await seedPool(100_000_000);
    const p = await seedPlan();
    const u = await seedUser();
    const { orderId } = await createPlanOrder({ userId: u.id, planId: p.id });

    await setPlanPrice(actor, p.id, 99_000);

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order.amountIdr).toBe(55_000);
  });

  it("are validated: range, and flat price must stay below the compare-at price", async () => {
    const p = await seedPlan({ compareAtPriceIdr: 70_000 });
    await expect(setPlanPrice(actor, p.id, 9_000)).rejects.toBeInstanceOf(AdminError);
    await expect(setPlanPrice(actor, p.id, 70_000)).rejects.toBeInstanceOf(AdminError);
    expect((await rowOf(p.id)).priceIdr).toBe(55_000);
    expect(await audits("plan.set_price")).toHaveLength(0);
  });
});

describe("changing credit on a plan that has been sold", () => {
  it("asks for confirmation, and goes through with it", async () => {
    const p = await seedPlan();
    await paidOrder(p.id);

    await expect(updatePlan(actor, p.id, input({ creditUsd: "25" }))).rejects.toMatchObject({ code: "CREDIT_CHANGE_NEEDS_CONFIRM" });
    expect((await rowOf(p.id)).creditQuota).toBe(10_000_000);

    await updatePlan(actor, p.id, input({ creditUsd: "25" }), { confirmCreditChange: true });
    expect((await rowOf(p.id)).creditQuota).toBe(12_500_000);
  });

  it("changes freely when nothing was sold, and other edits never need confirmation", async () => {
    const p = await seedPlan();
    await updatePlan(actor, p.id, input({ creditUsd: "25" }));
    expect((await rowOf(p.id)).creditQuota).toBe(12_500_000);

    await paidOrder(p.id);
    await expect(updatePlan(actor, p.id, input({ creditUsd: "25", badge: "Terlaris" }))).resolves.toBeDefined();
  });

  it("duplicates into a new disabled, unsynced plan", async () => {
    const p = await seedPlan({ soldCount: 4, stockLimit: 10 });
    const copy = await duplicatePlan(actor, p.id);
    expect(copy).toMatchObject({ enabled: false, soldCount: 0, newapiPlanId: null, syncedVersion: null, creditQuota: p.creditQuota, priceIdr: p.priceIdr });
    expect(copy.slug).not.toBe(p.slug);
    expect(copy.name).toBe("Bulanan $20 (salinan)");
    expect((await audits("plan.duplicate"))[0]).toMatchObject({ target: `plan:${copy.id}` });
  });
});

describe("disabling", () => {
  it("takes the plan off sale, audits it, and needs a sync", async () => {
    await seedPool(100_000_000);
    const p = await seedPlan();
    const r = await setPlanEnabled(actor, p.id, false);
    expect(r.needsSync).toBe(true);
    expect(await tryBuy(p.id)).toBe("PLAN_UNAVAILABLE");
    expect((await audits("plan.disable"))[0]).toMatchObject({ before: { enabled: true }, after: { enabled: false } });
    expect((await setPlanEnabled(actor, p.id, false)).needsSync).toBe(false);
  });

  it("a never-synced disabled draft is not pushed", async () => {
    const draft = await createPlan(actor, input({ enabled: "" }));
    expect(await syncPlansBestEffort([draft.id])).toEqual([]);
    expect(await retryUnsyncedPlans()).toMatchObject({ synced: 0 });
    expect(fake.newapiPlans.size).toBe(0);
  });
});

describe("movePlan", () => {
  it("swaps neighbours, renumbers ties, and marks only plans whose sort order changed", async () => {
    const a = await seedPlan({ name: "A", sortOrder: 1 });
    const b = await seedPlan({ name: "B", sortOrder: 2 });
    const c = await seedPlan({ name: "C", sortOrder: 2 }); // tie with B

    const changed = await movePlan(actor, c.id, "up");

    const order = (await listAdminPlans()).map((p) => p.name);
    expect(order).toEqual(["A", "C", "B"]);
    expect(changed).toEqual([b.id]); // C keeps sort order 2 (it only left the tie); B moves to 3
    expect((await rowOf(a.id)).fieldsVersion).toBe(1);
    expect((await rowOf(c.id)).sortOrder).toBe(2);
    expect((await rowOf(b.id)).sortOrder).toBe(3);
    expect(await movePlan(actor, a.id, "up")).toEqual([]);
    expect((await audits("plan.move")).length).toBe(1);
  });
});

describe("reordering keeps every plan sellable", () => {
  it("leaves versions and sync state alone, touches only the swapped pair, and pushes sort_order", async () => {
    await seedPool(100_000_000);
    const [a, b, c] = [await seedPlan({ name: "A", sortOrder: 1, newapiPlanId: 7 }), await seedPlan({ name: "B", sortOrder: 2, newapiPlanId: 8 }), await seedPlan({ name: "C", sortOrder: 3, newapiPlanId: 9 })];

    const changed = [...(await movePlan(actor, c.id, "up")), ...(await movePlan(actor, a.id, "down")), ...(await movePlan(actor, b.id, "up"))];
    await pushSortOrdersBestEffort(changed);

    expect((await listAdminPlans()).map((p) => [p.name, p.sortOrder, p.synced, p.fieldsVersion])).toEqual([
      ["C", 1, true, 1],
      ["B", 2, true, 1],
      ["A", 3, true, 1],
    ]);
    expect(fake.newapiPlans.get(9)).toMatchObject({ sort_order: 1 });
    for (const p of [a, b, c]) expect(await tryBuy(p.id)).toBe("bought");
  });

  it("a failed push to New API changes nothing", async () => {
    const a = await seedPlan({ name: "A", sortOrder: 1 });
    const b = await seedPlan({ name: "B", sortOrder: 2, newapiPlanId: 8 });
    fake.state.rejectPlan = 5;

    await pushSortOrdersBestEffort(await movePlan(actor, b.id, "up"));

    expect(fake.state.calls.some((c) => c.includes("/admin/plans"))).toBe(true);
    for (const p of [a, b]) expect(await rowOf(p.id)).toMatchObject({ fieldsVersion: 1, syncedVersion: 1 });
    expect((await listAdminPlans()).map((p) => p.name)).toEqual(["B", "A"]);
  });

  it("does not push an unsynced plan", async () => {
    const a = await seedPlan({ name: "A", sortOrder: 1 });
    await updatePlan(actor, a.id, input({ name: "A2", sortOrder: "1" })); // now stale
    const b = await seedPlan({ name: "B", sortOrder: 2 });
    fake.state.calls.length = 0;

    await pushSortOrdersBestEffort(await movePlan(actor, b.id, "up"));

    expect(fake.state.calls.filter((c) => c.includes("/admin/plans"))).toHaveLength(1); // only B, not stale A
    expect((await rowOf(a.id)).syncedVersion).toBe(1);
  });
});

describe("assertUpgradeGroupAllowed", () => {
  it("listGroups sorts and drops blanks and duplicates", async () => {
    fake.state.groups = ["vip", " ", "default", "vip"];
    await expect(listGroups()).resolves.toEqual(["default", "vip"]);
  });

  it("accepts a group the console lists, rejects an unknown one", async () => {
    await expect(assertUpgradeGroupAllowed("vip")).resolves.toBeUndefined();
    await expect(assertUpgradeGroupAllowed("ghost")).rejects.toBeInstanceOf(AdminError);
  });

  it("accepts the empty option without asking the console", async () => {
    fake.state.groups = null;
    await expect(assertUpgradeGroupAllowed(null)).resolves.toBeUndefined();
    expect(fake.state.calls.filter((c) => c.includes("/api/group/"))).toHaveLength(0);
  });

  it("with the console down, an unchanged group passes and a changed one is rejected", async () => {
    const p = await seedPlan({ upgradeGroup: "legacy" });
    fake.state.groups = null;
    await expect(assertUpgradeGroupAllowed("legacy", p.id)).resolves.toBeUndefined();
    await expect(assertUpgradeGroupAllowed("vip", p.id)).rejects.toThrow(/tidak bisa dimuat/);
    await expect(assertUpgradeGroupAllowed("vip")).rejects.toBeInstanceOf(AdminError);
  });

  it("an unchanged group that is gone from the console still passes", async () => {
    const p = await seedPlan({ upgradeGroup: "legacy" });
    await expect(assertUpgradeGroupAllowed("legacy", p.id)).resolves.toBeUndefined();
  });
});

describe("listAdminPlans", () => {
  it("reports paid orders and revenue per plan and the sync state", async () => {
    const p = await seedPlan({ newapiPlanId: null });
    const q = await seedPlan();
    await paidOrder(q.id);
    await paidOrder(q.id);

    const rows = await listAdminPlans();
    expect(rows.find((r) => r.id === p.id)).toMatchObject({ paidCount: 0, revenueIdr: 0, synced: false });
    expect(rows.find((r) => r.id === q.id)).toMatchObject({ paidCount: 2, revenueIdr: 110_000, synced: true });
  });
});
