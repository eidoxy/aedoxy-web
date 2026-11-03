import { sql } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/server/auth";
import { db, pool as pgPool } from "@/server/db/client";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";

vi.mock("@/server/email", () => ({ sendEmail: async () => undefined }));

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);
afterEach(() => vi.unstubAllEnvs());

type Auth = typeof auth;

/** A real HTTP call through the Better Auth handler (not auth.api, which bypasses the rate limiter). */
const signIn = (instance: Auth, headers: Record<string, string>) =>
  instance.handler(
    new Request("https://aedoxy.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://aedoxy.test", ...headers },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password-123" }),
    }),
  );

const counters = async () => (await db.execute<{ key: string; count: number }>(sql`select key, count from rate_limit order by key`)).rows;

describe("Better Auth rate limit storage", () => {
  it("is explicit, stored in the database, and the console endpoints get a looser limit", () => {
    expect(auth.options.rateLimit).toMatchObject({ enabled: true, storage: "database", window: 60, max: 100 });
    const rules = auth.options.rateLimit?.customRules;
    expect(rules?.["/sign-in/email"]).toEqual({ window: 60, max: 5 });
    for (const path of ["/oauth2/token", "/oauth2/userinfo", "/jwks"]) expect(rules?.[path]).toEqual({ window: 60, max: 600 });
  });

  it("limits /sign-in/email to 5 per minute per IP, keeps the counter in Postgres and survives a new auth instance", async () => {
    const ip = { "cf-connecting-ip": "203.0.113.9" };
    for (let i = 0; i < 5; i++) expect((await signIn(auth, ip)).status).not.toBe(429);
    const sixth = await signIn(auth, ip);
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("x-retry-after")).toBeTruthy();
    expect(await counters()).toEqual([{ key: "203.0.113.9|/sign-in/email", count: 5 }]);

    // A "restart" or another instance: fresh module graph, same database.
    vi.resetModules();
    const fresh = (await import("@/server/auth")).auth;
    expect(fresh).not.toBe(auth);
    expect((await signIn(fresh, ip)).status).toBe(429);
    expect((await signIn(fresh, { "cf-connecting-ip": "203.0.113.10" })).status).not.toBe(429);
  });

  // Better Auth caches its test/development flag at load and then falls back to 127.0.0.1 when no trusted address
  // exists, so the real production "no-trusted-ip" key cannot be observed under vitest. This still proves that
  // x-forwarded-for is not used for the key in production mode and that a missing address does not skip the limit.
  it("in production ignores x-forwarded-for: spoofed values share one bucket instead of skipping the limit", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const prod = (await import("@/server/auth")).auth;
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < 5; i++) expect((await signIn(prod, { "x-forwarded-for": `198.51.100.${i}` })).status).not.toBe(429);
    expect((await signIn(prod, { "x-forwarded-for": "198.51.100.99" })).status).toBe(429);
    const rows = await counters();
    expect(rows).toHaveLength(1);
    expect(rows[0].key).not.toContain("198.51.100");
    expect(rows[0].count).toBe(5);
    // cf-connecting-ip is trusted and gets its own bucket.
    expect((await signIn(prod, { "cf-connecting-ip": "203.0.113.20" })).status).not.toBe(429);
    vi.restoreAllMocks();
  });
});
