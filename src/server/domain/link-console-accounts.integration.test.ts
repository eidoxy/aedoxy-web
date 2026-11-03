import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, pool as pgPool } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { installFakeServers, prepareDatabase, resetDatabase, seedUser } from "@/server/test/helpers";
import { LINK_BATCH, linkConsoleAccounts } from "./link-console-accounts";

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

const unlinked = (overrides: Partial<typeof user.$inferInsert> = {}) => seedUser({ newapiUserId: null, ...overrides });
const linkedId = async (id: string) => (await db.select({ n: user.newapiUserId }).from(user).where(eq(user.id, id)))[0].n;

describe("linkConsoleAccounts", () => {
  it("links a verified user and sends the stored username", async () => {
    const u = await unlinked({ username: "ada_1" });
    expect(await linkConsoleAccounts()).toMatchObject({ ok: 1, failed: 0 });
    expect(await linkedId(u.id)).toBe(9000);
    expect(fake.state.ensureBodies[0]).toMatchObject({ subject: u.id, username: "ada_1" });
  });

  it("skips unverified, banned and already linked users, but links one whose ban has ended", async () => {
    const unverified = await unlinked({ emailVerified: false });
    const banned = await unlinked({ banned: true });
    const bannedForever = await unlinked({ banned: true, banExpires: new Date(Date.now() + 3_600_000) });
    const banEnded = await unlinked({ banned: true, banExpires: new Date(Date.now() - 3_600_000) });
    const linked = await seedUser({ newapiUserId: 55 });

    expect(await linkConsoleAccounts()).toMatchObject({ ok: 1, failed: 0 });
    expect(fake.state.ensureBodies.map((b) => b.subject)).toEqual([banEnded.id]);
    for (const u of [unverified, banned, bannedForever]) expect(await linkedId(u.id)).toBeNull();
    expect(await linkedId(linked.id)).toBe(55);
  });

  it("handles at most LINK_BATCH users per run, oldest first", async () => {
    const base = Date.now() - 1_000_000;
    const all = [];
    for (let i = 0; i < LINK_BATCH + 3; i++) all.push(await unlinked({ createdAt: new Date(base + i * 1000) }));

    expect(await linkConsoleAccounts()).toMatchObject({ ok: LINK_BATCH, failed: 0 });
    expect(fake.state.ensureBodies.map((b) => b.subject)).toEqual(all.slice(0, LINK_BATCH).map((u) => u.id));
    // The next run takes the remaining three.
    expect(await linkConsoleAccounts()).toMatchObject({ ok: 3, failed: 0 });
  });

  it("does not let one failing user hold back the others, and retries it next run", async () => {
    const a = await unlinked({ createdAt: new Date(Date.now() - 3000) });
    const b = await unlinked({ createdAt: new Date(Date.now() - 2000) });
    const c = await unlinked({ createdAt: new Date(Date.now() - 1000) });
    fake.state.failEnsure.add(b.id);

    const result = await linkConsoleAccounts();
    expect(result).toMatchObject({ ok: 2, failed: 1, codes: { "http:500": 1 } });
    expect(await linkedId(a.id)).not.toBeNull();
    expect(await linkedId(b.id)).toBeNull();
    expect(await linkedId(c.id)).not.toBeNull();

    fake.state.failEnsure.clear();
    expect(await linkConsoleAccounts()).toMatchObject({ ok: 1, failed: 0 });
    expect(await linkedId(b.id)).not.toBeNull();
  });

  it("is correct when two workers link the same user at once", async () => {
    const u = await unlinked();
    const results = await Promise.all([linkConsoleAccounts(), linkConsoleAccounts()]);
    expect(results.every((r) => r.failed === 0)).toBe(true);
    expect(await linkedId(u.id)).toBe(9000);
    expect(fake.consoleAccounts.size).toBe(1);
  });
});
