import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; email: string; name: string; emailVerified: boolean; newapiUserId: number | null };
const state = vi.hoisted(() => ({ row: undefined as Row | undefined }));
const updateSet = vi.hoisted(() => vi.fn());

// Minimal drizzle stand-in: select().from().where().limit() -> [row]; update().set().where().
vi.mock("@/server/db/client", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (state.row ? [state.row] : []) }) }) }),
    update: () => ({
      set: (values: Partial<Row>) => {
        updateSet(values);
        return {
          where: async () => {
            if (state.row) Object.assign(state.row, values);
          },
        };
      },
    }),
  },
}));
vi.mock("@/server/db/schema", () => ({ user: { id: "id" } }));
vi.mock("drizzle-orm", () => ({ eq: () => ({}) }));

const ensureConsoleAccount = vi.hoisted(() => vi.fn());
vi.mock("@/server/integrations/newapi", () => ({ ensureConsoleAccount }));

import { ensureConsoleAccountForUser } from "./account";

describe("ensureConsoleAccountForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.row = { id: "u1", email: "a@b.co", name: "Ada", emailVerified: true, newapiUserId: null };
    ensureConsoleAccount.mockResolvedValue({ userId: 7, username: "aedoxy_1", created: true });
  });

  it("links once, then is a no-op", async () => {
    await expect(ensureConsoleAccountForUser("u1")).resolves.toBe(7);
    await expect(ensureConsoleAccountForUser("u1")).resolves.toBe(7);
    expect(ensureConsoleAccount).toHaveBeenCalledTimes(1);
    expect(ensureConsoleAccount).toHaveBeenCalledWith({ subject: "u1", email: "a@b.co", displayName: "Ada" });
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith({ newapiUserId: 7 });
  });

  it("does nothing for an unverified or missing user", async () => {
    state.row!.emailVerified = false;
    await expect(ensureConsoleAccountForUser("u1")).resolves.toBeNull();
    state.row = undefined;
    await expect(ensureConsoleAccountForUser("u1")).resolves.toBeNull();
    expect(ensureConsoleAccount).not.toHaveBeenCalled();
  });

  it("leaves newapi_user_id null when the bridge fails, so a later call retries", async () => {
    ensureConsoleAccount.mockRejectedValueOnce(new Error("bridge down"));
    await expect(ensureConsoleAccountForUser("u1")).rejects.toThrow("bridge down");
    expect(state.row!.newapiUserId).toBeNull();
    await expect(ensureConsoleAccountForUser("u1")).resolves.toBe(7);
  });
});
