import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, creditPool, poolLedger } from "@/server/db/schema";
import { prepareDatabase, readPool, resetDatabase, seedPool } from "@/server/test/helpers";
import { adminAdjustPool, adminSetLowThreshold, getPoolOverview, ledgerCsv, listLedger } from "./admin-pool";
import { AdminError } from "./audit";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const Q = 500_000;
const actor = { id: "admin-1", ip: "198.51.100.4" };

/** Opening balance the way the seed does it: pool row plus matching ledger row. */
async function openPool(quota: number) {
  await seedPool(quota);
  await db.insert(poolLedger).values({ type: "admin_adjust", delta: quota, actorId: "seed", note: "opening" });
}

describe("adminAdjustPool", () => {
  it("adds stock: pool total, one ledger row and one audit row", async () => {
    await openPool(100 * Q);

    await adminAdjustPool(actor, { deltaQuota: 50 * Q, note: "  beli kredit upstream  " });

    expect((await readPool()).totalQuota).toBe(150 * Q);
    const ledger = await db.select().from(poolLedger);
    expect(ledger.at(-1)).toMatchObject({ type: "admin_adjust", delta: 50 * Q, actorId: "admin-1", note: "beli kredit upstream" });
    const audit = await db.select().from(adminAuditLog);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorId: "admin-1",
      action: "pool.adjust",
      target: "credit_pool:1",
      ip: "198.51.100.4",
      before: { totalQuota: 100 * Q },
      after: { totalQuota: 150 * Q, deltaQuota: 50 * Q },
    });
    expect((await getPoolOverview())?.invariant?.ok).toBe(true);
  });

  it("refuses to remove more than is available, and leaves no ledger or audit trace", async () => {
    await openPool(10 * Q);
    await db.update(creditPool).set({ reservedQuota: 6 * Q }); // 4Q available; the ledger is not consulted here

    await expect(adminAdjustPool(actor, { deltaQuota: -(4 * Q + 1), note: "terlalu banyak" })).rejects.toBeInstanceOf(AdminError);

    expect((await readPool()).totalQuota).toBe(10 * Q);
    expect(await db.select().from(poolLedger)).toHaveLength(1);
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);

    await adminAdjustPool(actor, { deltaQuota: -4 * Q, note: "tepat sebatas tersedia" });
    expect((await readPool()).totalQuota).toBe(6 * Q);
  });

  it("removes stock down to exactly zero available", async () => {
    await openPool(10 * Q);
    await adminAdjustPool(actor, { deltaQuota: -10 * Q, note: "kembalikan" });
    expect((await readPool()).totalQuota).toBe(0);
  });

  it("rejects a zero delta, an empty note and a missing pool row", async () => {
    await openPool(10 * Q);
    await expect(adminAdjustPool(actor, { deltaQuota: 0, note: "x" })).rejects.toBeInstanceOf(AdminError);
    await expect(adminAdjustPool(actor, { deltaQuota: Q, note: "   " })).rejects.toBeInstanceOf(AdminError);

    await db.delete(creditPool);
    await expect(adminAdjustPool(actor, { deltaQuota: Q, note: "x" })).rejects.toBeInstanceOf(AdminError);
  });
});

describe("adminSetLowThreshold", () => {
  it("stores the threshold and audits the old and new value", async () => {
    await openPool(10 * Q);
    await adminSetLowThreshold(actor, 25 * Q);
    expect((await readPool()).lowThresholdQuota).toBe(25 * Q);
    const [audit] = await db.select().from(adminAuditLog);
    expect(audit).toMatchObject({ action: "pool.set_threshold", before: { lowThresholdQuota: 0 }, after: { lowThresholdQuota: 25 * Q } });
    await expect(adminSetLowThreshold(actor, -1)).rejects.toBeInstanceOf(AdminError);
  });
});

describe("ledger list and CSV", () => {
  it("filters by type and by WIB day, paginates, and exports with formula-safe cells", async () => {
    await openPool(10 * Q);
    await adminAdjustPool(actor, { deltaQuota: Q, note: "=HYPERLINK(\"http://evil\")" });
    await adminAdjustPool(actor, { deltaQuota: -Q, note: "koreksi, salah input" });

    expect((await listLedger({}, 1, 2)).rows).toHaveLength(2);
    expect((await listLedger({}, 2, 2)).rows).toHaveLength(1);
    expect((await listLedger({}, 1, 2)).total).toBe(3);
    expect((await listLedger({ type: "reserve" }, 1, 10)).total).toBe(0);
    expect((await listLedger({ type: "admin_adjust" }, 1, 10)).total).toBe(3);
    expect((await listLedger({ type: "not-a-type", from: "garbage" }, 1, 10)).total).toBe(3);
    expect((await listLedger({ from: "2999-01-01" }, 1, 10)).total).toBe(0);
    const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
    expect((await listLedger({ from: today, to: today }, 1, 10)).total).toBe(3);

    const csv = await ledgerCsv({});
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("id,created_at,type,delta_quota,trade_no,actor_id,note");
    expect(lines).toHaveLength(4);
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`); // formula neutralised
    expect(csv).toContain(`,-${Q},`); // negative delta stays a plain number
    expect(csv).toContain('"koreksi, salah input"');
  });
});
