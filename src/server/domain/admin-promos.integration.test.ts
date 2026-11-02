import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromoInput } from "@/lib/schemas/promo";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, promotions } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, resetDatabase, seedPlan, seedPool, seedUser } from "@/server/test/helpers";
import { createPromo, listPromos, promoStatus, stopPromo } from "./admin-promos";
import { AdminError } from "./audit";
import { createPlanOrder, OrderError, settleOrderPaid } from "./orders";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);
afterEach(() => vi.unstubAllGlobals());

const admin = { id: "admin-1", ip: "203.0.113.9" };
const input = (over: Partial<PromoInput> = {}): PromoInput => ({
  name: "Uji",
  kind: "percent",
  value: 10,
  code: null,
  planIds: [],
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  perUserLimit: 1,
  ...over,
});

describe("createPromo / stopPromo", () => {
  it("creates the promo and one audit row with the actor and the stored values", async () => {
    const plan = await seedPlan();
    const p = await createPromo(admin, input({ code: "Hemat", planIds: [plan.id, plan.id], maxRedemptions: 5 }));
    expect(p).toMatchObject({ code: "Hemat", planIds: [plan.id], redeemedCount: 0, enabled: true, maxRedemptions: 5 });
    const [a] = await db.select().from(adminAuditLog);
    expect(a).toMatchObject({ actorId: "admin-1", action: "promo.create", target: `promo:${p.id}`, ip: "203.0.113.9" });
    expect(a.after).toMatchObject({ code: "Hemat", kind: "percent", value: 10 });
  });

  it("refuses a duplicate code in any letter case, an unknown plan and a period that already ended; nothing is audited", async () => {
    await createPromo(admin, input({ code: "Hemat" }));
    await expect(createPromo(admin, input({ code: "HEMAT" }))).rejects.toBeInstanceOf(AdminError);
    await expect(createPromo(admin, input({ planIds: [9999] }))).rejects.toThrow("Ada paket yang tidak ditemukan.");
    await expect(createPromo(admin, input({ endsAt: new Date(Date.now() - 1000) }))).rejects.toThrow("Akhir periode sudah lewat.");
    expect(await db.select().from(adminAuditLog)).toHaveLength(1);
    expect(await db.select().from(promotions)).toHaveLength(1);
  });

  it("stop disables it and audits before/after; stopping twice is refused", async () => {
    const p = await createPromo(admin, input({ code: "BERHENTI" }));
    const stopped = await stopPromo(admin, p.id);
    expect(stopped.enabled).toBe(false);
    const rows = await db.select().from(adminAuditLog).where(eq(adminAuditLog.action, "promo.stop"));
    expect(rows).toHaveLength(1);
    expect(rows[0].before).toMatchObject({ enabled: true });
    expect(rows[0].after).toMatchObject({ enabled: false });
    await expect(stopPromo(admin, p.id)).rejects.toThrow("sudah dihentikan");
    await expect(stopPromo(admin, 9999)).rejects.toThrow("tidak ditemukan");
  });

  it("a stopped promo refuses new orders but a reservation taken earlier still settles", async () => {
    installFakeServers();
    await seedPool(100 * 10_000_000);
    const plan = await seedPlan({ creditQuota: 10_000_000 });
    const p = await createPromo(admin, input({ code: "STOP" }));
    const early = await seedUser();
    const { orderId } = await createPlanOrder({ userId: early.id, planId: plan.id, promoCode: "STOP" });

    await stopPromo(admin, p.id);

    const late = await seedUser();
    await expect(createPlanOrder({ userId: late.id, planId: plan.id, promoCode: "STOP" })).rejects.toBeInstanceOf(OrderError);
    expect(await settleOrderPaid(orderId)).toBe("settled");
  });
});

describe("listPromos", () => {
  it("derives status and totals the discount of paid orders only", async () => {
    installFakeServers();
    await seedPool(100 * 10_000_000);
    const plan = await seedPlan({ creditQuota: 10_000_000, priceIdr: 55_000 });
    const now = new Date();
    const live = await createPromo(admin, input({ code: "LIVE", maxRedemptions: 10 }));
    const soon = await createPromo(admin, input({ name: "Nanti", startsAt: new Date(now.getTime() + 3_600_000) }));
    const done = await createPromo(admin, input({ name: "Selesai" }));
    await stopPromo(admin, done.id);

    const [u1, u2] = [await seedUser(), await seedUser()];
    const paid = await createPlanOrder({ userId: u1.id, planId: plan.id, promoCode: "LIVE" });
    await createPlanOrder({ userId: u2.id, planId: plan.id, promoCode: "LIVE" }); // stays pending
    await settleOrderPaid(paid.orderId);

    const list = await listPromos(now);
    const byId = new Map(list.map((p) => [p.id, p]));
    expect(byId.get(live.id)).toMatchObject({ status: "active", redeemedCount: 2, totalDiscountIdr: 5_500, paidOrders: 1 });
    expect(byId.get(soon.id)).toMatchObject({ status: "scheduled", totalDiscountIdr: 0 });
    expect(byId.get(done.id)).toMatchObject({ status: "ended" });
  });

  it("promoStatus", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    const t = (ms: number) => new Date(now.getTime() + ms);
    expect(promoStatus({ enabled: true, startsAt: null, endsAt: null }, now)).toBe("active");
    expect(promoStatus({ enabled: true, startsAt: t(1), endsAt: null }, now)).toBe("scheduled");
    expect(promoStatus({ enabled: true, startsAt: null, endsAt: now }, now)).toBe("ended");
    expect(promoStatus({ enabled: false, startsAt: null, endsAt: null }, now)).toBe("ended");
  });
});
