import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { deleteExpiredRateLimits, hitRateLimit, resetRateLimit } from "@/server/rate-limit";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";

beforeAll(prepareDatabase);
beforeEach(resetDatabase);
afterAll(() => pgPool.end());

const hit = (key: string, over: Partial<Parameters<typeof hitRateLimit>[0]> = {}) => hitRateLimit({ key, windowMs: 60_000, max: 3, failOpen: false, ...over });

describe("hitRateLimit", () => {
  it("allows up to max, then refuses with a retry delay", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await hit("t:basic"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0, 0]);
    expect(results[3].retryAfterMs).toBeGreaterThan(0);
    expect(results[3].retryAfterMs).toBeLessThanOrEqual(60_000);
    expect((await hit("t:other")).allowed).toBe(true);
  });

  it("is atomic: 25 parallel hits with max 10 allow exactly 10", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => hit("t:parallel", { max: 10 })));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
  });

  it("starts a new window once reset_at has passed, using the database clock", async () => {
    for (let i = 0; i < 4; i++) await hit("t:window");
    expect((await hit("t:window")).allowed).toBe(false);
    await db.execute(sql`update rate_limits set reset_at = now() - interval '1 second' where key = 't:window'`);
    const again = await hit("t:window");
    expect(again).toMatchObject({ allowed: true, remaining: 2 });
    const { rows } = await db.execute<{ count: number }>(sql`select count from rate_limits where key = 't:window'`);
    expect(rows[0].count).toBe(1);
  });

  it("caps the stored count so a flood cannot overflow it", async () => {
    for (let i = 0; i < 10; i++) await hit("t:cap");
    const { rows } = await db.execute<{ count: number }>(sql`select count from rate_limits where key = 't:cap'`);
    expect(rows[0].count).toBe(4);
  });

  it("stores a hash instead of a very long key", async () => {
    const long = `t:${"x".repeat(500)}`;
    await hit(long);
    await hit(long);
    const { rows } = await db.execute<{ key: string; count: number }>(sql`select key, count from rate_limits`);
    expect(rows).toHaveLength(1);
    expect(rows[0].key.length).toBeLessThan(128);
    expect(rows[0].key).toMatch(/^t:sha256:[0-9a-f]{64}$/);
    expect(rows[0].count).toBe(2);
  });

  describe("when the database fails", () => {
    it("refuses when failOpen is false and allows when it is true, without logging the key", async () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const exec = vi.spyOn(db, "execute").mockRejectedValue(new Error("connection refused"));
      try {
        expect(await hit("secret:user-1", { failOpen: false })).toMatchObject({ allowed: false, retryAfterMs: 60_000 });
        expect(await hit("secret:user-1", { failOpen: true })).toMatchObject({ allowed: true });
        expect(JSON.stringify(error.mock.calls)).not.toContain("user-1");
        expect(error).toHaveBeenCalledTimes(2);
      } finally {
        exec.mockRestore();
        error.mockRestore();
      }
    });
  });
});

describe("resetRateLimit", () => {
  it("forgets a key", async () => {
    for (let i = 0; i < 4; i++) await hit("t:reset");
    expect((await hit("t:reset")).allowed).toBe(false);
    await resetRateLimit("t:reset");
    expect((await hit("t:reset")).allowed).toBe(true);
  });
});

describe("deleteExpiredRateLimits", () => {
  it("removes counters that ended over an hour ago, in both tables, and keeps the rest", async () => {
    await hit("t:old");
    await hit("t:recent");
    await hit("t:live");
    await db.execute(sql`update rate_limits set reset_at = now() - interval '2 hours' where key = 't:old'`);
    await db.execute(sql`update rate_limits set reset_at = now() - interval '5 minutes' where key = 't:recent'`);
    const nowMs = Date.now();
    await db.execute(sql`insert into rate_limit (id, key, count, last_request) values ('1', '1.1.1.1|/a', 1, ${nowMs - 2 * 3_600_000}), ('2', '2.2.2.2|/a', 1, ${nowMs})`);

    expect(await deleteExpiredRateLimits()).toBe(2);
    const { rows } = await db.execute<{ key: string }>(sql`select key from rate_limits order by key`);
    expect(rows.map((r) => r.key)).toEqual(["t:live", "t:recent"]);
    const { rows: authRows } = await db.execute<{ key: string }>(sql`select key from rate_limit`);
    expect(authRows.map((r) => r.key)).toEqual(["2.2.2.2|/a"]);
  });

  it("deletes at most `limit` rows per call", async () => {
    for (const k of ["a", "b", "c"]) await hit(`t:${k}`);
    await db.execute(sql`update rate_limits set reset_at = now() - interval '2 hours'`);
    expect(await deleteExpiredRateLimits(2)).toBe(2);
    expect(await deleteExpiredRateLimits(2)).toBe(1);
  });
});
