import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ session: null as unknown, tags: [] as string[] }));
vi.mock("@/server/session", () => ({ getSession: async () => current.session }));
vi.mock("@/server/auth", () => ({ auth: { api: {} } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {}, updateTag: (t: string) => void current.tags.push(t) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));

import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog } from "@/server/db/schema";
import { getModelMeta } from "@/server/domain/admin-models";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { deleteModelMetaAction, saveModelMetaAction } from "./actions";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  current.tags = [];
  current.session = { user: { id: "admin-1", role: "admin", twoFactorEnabled: true }, session: { id: "s1" } };
});

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const save = () => saveModelMetaAction({}, form({ modelName: "gpt-5", provider: "openai", visible: "on" }));

describe("deleteModelMetaAction", () => {
  it("deletes, audits and expires the models tag", async () => {
    await save();
    current.tags = [];
    expect(await deleteModelMetaAction({}, form({ modelName: " gpt-5 " }))).toEqual({ ok: "Metadata model dihapus." });
    expect(await getModelMeta("gpt-5")).toBeNull();
    expect(current.tags).toContain("models");
    const audits = await db.select().from(adminAuditLog);
    expect(audits.at(-1)).toMatchObject({ actorId: "admin-1", action: "model_meta.delete", target: "model_meta:gpt-5", ip: "203.0.113.7" });
  });

  it("rejects invalid input and unknown names without a tag or audit row", async () => {
    expect(await deleteModelMetaAction({}, form({ modelName: "  " }))).toEqual({ error: "Nama model tidak valid." });
    expect(await deleteModelMetaAction({}, form({ modelName: "x".repeat(201) }))).toEqual({ error: "Nama model tidak valid." });
    expect(await deleteModelMetaAction({}, form({ modelName: "nope" }))).toEqual({ error: "Metadata model tidak ditemukan." });
    expect(current.tags).toEqual([]);
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("refuses non-admin and anonymous callers and keeps the row", async () => {
    await save();
    current.session = { user: { id: "u1", role: "user", twoFactorEnabled: true }, session: { id: "s2" } };
    await expect(deleteModelMetaAction({}, form({ modelName: "gpt-5" }))).rejects.toThrow("NOT_FOUND");
    current.session = null;
    await expect(deleteModelMetaAction({}, form({ modelName: "gpt-5" }))).rejects.toThrow("REDIRECT /login");
    expect(await getModelMeta("gpt-5")).not.toBeNull();
  });
});
