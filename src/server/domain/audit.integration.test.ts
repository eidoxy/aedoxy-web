import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog } from "@/server/db/schema";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { writeAudit } from "./audit";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const actor = { id: "admin-1", ip: "203.0.113.9" };

describe("writeAudit", () => {
  it("stores actor, action, target, before, after and ip", async () => {
    await db.transaction((tx) => writeAudit(tx, { actor, action: "plan.update", target: "plan:3", before: { price: 1 }, after: { price: 2 } }));

    const rows = await db.select().from(adminAuditLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: "admin-1", action: "plan.update", target: "plan:3", before: { price: 1 }, after: { price: 2 }, ip: "203.0.113.9" });
  });

  it("is rolled back together with the change when the transaction fails", async () => {
    await expect(
      db.transaction(async (tx) => {
        await writeAudit(tx, { actor, action: "pool.adjust" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });
});
