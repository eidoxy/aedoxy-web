import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ session: null as unknown }));
vi.mock("@/server/session", () => ({ getSession: async () => current.session }));
// Configuration actions ask for no 2FA code: any call to a verifier fails the test.
const verify = vi.hoisted(() => vi.fn(async () => {
  throw new Error("2FA must not be requested for configuration changes");
}));
vi.mock("@/server/auth", () => ({ auth: { api: { verifyTOTP: verify, verifyBackupCode: verify } } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, updateTag: () => {} }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, plans } from "@/server/db/schema";
import { prepareDatabase, readPool, resetDatabase, seedPlan, seedPool } from "@/server/test/helpers";
import { adjustPoolAction, setThresholdAction } from "./pool/actions";
import { setEnabledAction, setPriceAction } from "./plans/actions";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  verify.mockClear();
  current.session = { user: { id: "admin-1", role: "admin", twoFactorEnabled: true }, session: { id: "s1" } };
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("money and price actions work for an admin without a code, and are audited", () => {
  it("pool adjustment and threshold", async () => {
    await seedPool(100 * 500_000);
    expect(await adjustPoolAction({}, form({ direction: "add", amountUsd: "10", note: "top up" }))).toEqual({ ok: "Stok diperbarui." });
    expect((await readPool()).totalQuota).toBe(110 * 500_000);
    expect(await setThresholdAction({}, form({ thresholdUsd: "25" }))).toEqual({ ok: "Ambang disimpan." });
    expect((await db.select().from(adminAuditLog)).map((a) => [a.actorId, a.action])).toEqual([
      ["admin-1", "pool.adjust"],
      ["admin-1", "pool.set_threshold"],
    ]);
    expect(verify).not.toHaveBeenCalled();
  });

  it("plan price and enabled switch", async () => {
    const p = await seedPlan();
    expect(await setPriceAction({}, form({ planId: String(p.id), priceIdr: "45000" }))).toEqual({ ok: "Harga disimpan. Berlaku untuk order baru." });
    expect((await db.select().from(plans).where(eq(plans.id, p.id)))[0].priceIdr).toBe(45_000);
    expect(await db.select().from(adminAuditLog)).toHaveLength(1);
    expect(verify).not.toHaveBeenCalled();
    // enabled switch goes through the same guard; sync to New API is out of scope here, so only the guard is checked
    current.session = { user: { id: "u1", role: "user", twoFactorEnabled: true }, session: { id: "s2" } };
    await expect(setEnabledAction({}, form({ planId: String(p.id), enabled: "false" }))).rejects.toThrow("NOT_FOUND");
  });

  it("a non-admin and an anonymous caller are refused and nothing changes", async () => {
    await seedPool(100 * 500_000);
    for (const [session, expected] of [
      [{ user: { id: "u1", role: "user", twoFactorEnabled: true }, session: { id: "s2" } }, "NOT_FOUND"],
      [null, "REDIRECT /login"],
    ] as const) {
      current.session = session;
      await expect(adjustPoolAction({}, form({ direction: "add", amountUsd: "10", note: "x" }))).rejects.toThrow(expected);
    }
    expect((await readPool()).totalQuota).toBe(100 * 500_000);
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });
});
