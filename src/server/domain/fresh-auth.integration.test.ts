import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { freshAuth, session } from "@/server/db/schema";
import { prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";
import { consumeFreshAuth, FRESH_AUTH_TTL_MS, grantFreshAuth, hasFreshAuth } from "./fresh-auth";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

async function seedSession(userId: string, id: string) {
  await db.insert(session).values({ id, token: `t-${id}`, userId, expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() });
}

describe("fresh_auth proofs", () => {
  it("is spent exactly once", async () => {
    const u = await seedUser();
    await seedSession(u.id, "s1");
    await grantFreshAuth("s1", "action");

    expect(await hasFreshAuth("s1", "action")).toBe(true);
    expect(await consumeFreshAuth("s1", "action")).toBe(true);
    expect(await consumeFreshAuth("s1", "action")).toBe(false);
    expect(await hasFreshAuth("s1", "action")).toBe(false);
  });

  it("two concurrent spends: one wins", async () => {
    const u = await seedUser();
    await seedSession(u.id, "s1");
    await grantFreshAuth("s1", "action");
    const results = await Promise.all([consumeFreshAuth("s1", "action"), consumeFreshAuth("s1", "action"), consumeFreshAuth("s1", "action")]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("expires after 5 minutes", async () => {
    const u = await seedUser();
    await seedSession(u.id, "s1");
    const t0 = new Date();
    await grantFreshAuth("s1", "action", t0);

    expect(await hasFreshAuth("s1", "action", new Date(t0.getTime() + FRESH_AUTH_TTL_MS - 1000))).toBe(true);
    expect(await consumeFreshAuth("s1", "action", new Date(t0.getTime() + FRESH_AUTH_TTL_MS + 1000))).toBe(false);
  });

  it("belongs to one session and one purpose", async () => {
    const u = await seedUser();
    await seedSession(u.id, "s1");
    await seedSession(u.id, "s2"); // same user, other session
    await grantFreshAuth("s1", "action");

    expect(await consumeFreshAuth("s2", "action")).toBe(false);
    expect(await consumeFreshAuth("s1", "passkey_register")).toBe(false);
    expect(await consumeFreshAuth("s1", "action")).toBe(true);
  });

  it("granting again renews instead of piling up rows, and sweeps expired rows", async () => {
    const u = await seedUser();
    await seedSession(u.id, "s1");
    await seedSession(u.id, "s2");
    const old = new Date(Date.now() - 2 * FRESH_AUTH_TTL_MS);
    await grantFreshAuth("s2", "action", old);
    await grantFreshAuth("s1", "action");
    await grantFreshAuth("s1", "action");

    const rows = await db.select().from(freshAuth);
    expect(rows).toHaveLength(1);
    expect(rows[0].sessionId).toBe("s1");
  });

  it("disappears with its session", async () => {
    const u = await seedUser();
    await seedSession(u.id, "s1");
    await grantFreshAuth("s1", "action");
    await db.delete(session).where(eq(session.id, "s1"));
    expect(await db.select().from(freshAuth)).toHaveLength(0);
  });
});
