import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { orders, subscriptionGrants } from "@/server/db/schema";
import { prepareDatabase, resetDatabase, seedPlan, seedPool, seedUser } from "@/server/test/helpers";
import { getActivePlanForUser, getPoolAvailable } from "./user-plan";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const now = new Date("2026-11-02T00:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

async function grant(userId: string, planId: number, name: string, endsAt: Date, extra: { reconciledAt?: Date } = {}) {
  const [order] = await db
    .insert(orders)
    .values({
      tradeNo: `T-${randomUUID().slice(0, 12)}`,
      userId,
      planId,
      planSnapshot: { name },
      creditQuota: 1_000_000,
      listPriceIdr: 55_000,
      amountIdr: 55_000,
      status: "paid",
      expiresAt: days(1),
    })
    .returning();
  await db.insert(subscriptionGrants).values({ orderId: order.id, newapiUserId: 1, newapiUserSubscriptionId: 1, creditQuota: 1_000_000, endsAt, ...extra });
}

describe("getActivePlanForUser", () => {
  it("returns the latest running grant of that user only", async () => {
    const [me, other] = [await seedUser(), await seedUser()];
    const plan = await seedPlan();
    await grant(me.id, plan.id, "Lama", days(-3));
    await grant(me.id, plan.id, "Aktif", days(10));
    await grant(other.id, plan.id, "Milik orang lain", days(20));

    expect(await getActivePlanForUser(me.id, now)).toEqual({ name: "Aktif", endsAt: days(10) });
  });

  it("ignores reconciled (replaced or returned) grants and returns null without any", async () => {
    const me = await seedUser();
    const plan = await seedPlan();
    expect(await getActivePlanForUser(me.id, now)).toBeNull();
    await grant(me.id, plan.id, "Diganti", days(10), { reconciledAt: now });
    expect(await getActivePlanForUser(me.id, now)).toBeNull();
  });
});

describe("getPoolAvailable", () => {
  it("is null without a pool row, else total minus reserved minus sold", async () => {
    expect(await getPoolAvailable()).toBeNull();
    await seedPool(100);
    expect(await getPoolAvailable()).toBe(100);
  });
});
