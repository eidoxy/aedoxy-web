import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";
import { isBannedNow } from "./ban-state";
import { STATUS_BATCH, syncConsoleAccountStatus, syncConsoleStatuses } from "./console-status";

let fake: ReturnType<typeof installFakeServers>;

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  fake = installFakeServers();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const HOUR = 3_600_000;
const flag = async (id: string) => (await db.select({ d: user.consoleDisabled }).from(user).where(eq(user.id, id)))[0].d;
/** A linked user whose console account exists in the fake and is enabled. */
async function linked(overrides: Partial<typeof user.$inferInsert> = {}) {
  const u = await seedUser(overrides);
  fake.consoleAccounts.set(u.id, { id: u.newapiUserId!, username: "x", enabled: true });
  return u;
}
const consoleEnabled = (id: string) => fake.consoleAccounts.get(id)!.enabled;

describe("isBannedNow", () => {
  it("honours the expiry", () => {
    const now = new Date();
    expect(isBannedNow({ banned: true, banExpires: null }, now)).toBe(true);
    expect(isBannedNow({ banned: true, banExpires: new Date(now.getTime() + HOUR) }, now)).toBe(true);
    expect(isBannedNow({ banned: true, banExpires: new Date(now.getTime() - HOUR) }, now)).toBe(false);
    expect(isBannedNow({ banned: false, banExpires: null }, now)).toBe(false);
    expect(isBannedNow({ banned: null, banExpires: null }, now)).toBe(false);
  });
});

describe("syncConsoleAccountStatus", () => {
  it("disables the console user on ban, enables again on unban, and records the pushed value", async () => {
    const u = await linked();
    expect(await syncConsoleAccountStatus(u.id)).toEqual({ state: "in_sync" });
    expect(fake.state.statusBodies).toHaveLength(0);

    await db.update(user).set({ banned: true }).where(eq(user.id, u.id));
    expect(await syncConsoleAccountStatus(u.id)).toEqual({ state: "synced" });
    expect(consoleEnabled(u.id)).toBe(false);
    expect(await flag(u.id)).toBe(true);
    expect(await syncConsoleAccountStatus(u.id)).toEqual({ state: "in_sync" });

    await db.update(user).set({ banned: false }).where(eq(user.id, u.id));
    expect(await syncConsoleAccountStatus(u.id)).toEqual({ state: "synced" });
    expect(consoleEnabled(u.id)).toBe(true);
    expect(await flag(u.id)).toBe(false);
  });

  it("treats an expired ban as not banned", async () => {
    const u = await linked({ banned: true, banExpires: new Date(Date.now() - HOUR), consoleDisabled: true });
    expect(await syncConsoleAccountStatus(u.id)).toEqual({ state: "synced" });
    expect(fake.state.statusBodies).toEqual([{ subject: u.id, enabled: true }]);
    expect(await flag(u.id)).toBe(false);
  });

  it("stays out of sync when the bridge fails, then catches up", async () => {
    const u = await linked({ banned: true });
    fake.state.failStatus.add(u.id);
    expect(await syncConsoleAccountStatus(u.id)).toEqual({ state: "pending", code: "http:500" });
    expect(await flag(u.id)).toBe(false);
    fake.state.failStatus.clear();
    expect(await syncConsoleAccountStatus(u.id)).toEqual({ state: "synced" });
    expect(consoleEnabled(u.id)).toBe(false);
  });

  it("marks a ban in sync without error when the console has no account (404)", async () => {
    const u = await seedUser({ banned: true });
    expect(await syncConsoleAccountStatus(u.id)).toEqual({ state: "synced" });
    expect(await flag(u.id)).toBe(true);
    expect(fake.state.ensureBodies).toHaveLength(0);
  });

  it("ensures the account first when enabling a user the console has never seen (404)", async () => {
    const u = await seedUser({ consoleDisabled: true });
    expect(await syncConsoleAccountStatus(u.id)).toEqual({ state: "synced" });
    expect(fake.state.ensureBodies).toHaveLength(1);
    expect(await flag(u.id)).toBe(false);
  });

  it("reports a protected console admin (409) and leaves the flag untouched, so it stays visible", async () => {
    const u = await linked({ banned: true });
    fake.state.protectedSubjects.add(u.id);
    expect(await syncConsoleAccountStatus(u.id)).toEqual({ state: "protected", code: "http:409" });
    expect(await flag(u.id)).toBe(false);
    expect(consoleEnabled(u.id)).toBe(true);
  });

  it("does nothing for a user without a console account", async () => {
    const u = await seedUser({ newapiUserId: null, banned: true });
    expect(await syncConsoleAccountStatus(u.id)).toEqual({ state: "no_account" });
    expect(fake.state.statusBodies).toHaveLength(0);
  });
});

describe("syncConsoleStatuses (worker)", () => {
  it("only touches users whose status differs, and one failure does not hold back the rest", async () => {
    const inSync = await linked();
    const a = await linked({ banned: true });
    const b = await linked({ banned: true });
    const c = await linked({ banned: true });
    const unlinkedBanned = await seedUser({ newapiUserId: null, banned: true });
    fake.state.failStatus.add(b.id);

    const result = await syncConsoleStatuses();
    expect(result).toMatchObject({ ok: 2, failed: 1, codes: { "pending:http:500": 1 } });
    expect(fake.state.statusBodies.map((s) => s.subject).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(consoleEnabled(inSync.id)).toBe(true);
    expect(await flag(unlinkedBanned.id)).toBe(false);

    fake.state.failStatus.clear();
    expect(await syncConsoleStatuses()).toMatchObject({ ok: 1, failed: 0 });
    expect(await syncConsoleStatuses()).toMatchObject({ ok: 0, failed: 0 });
  });

  it("handles at most STATUS_BATCH users per run", async () => {
    for (let i = 0; i < STATUS_BATCH + 2; i++) await linked({ banned: true });
    expect(await syncConsoleStatuses()).toMatchObject({ ok: STATUS_BATCH });
    expect(await syncConsoleStatuses()).toMatchObject({ ok: 2 });
  });
});
