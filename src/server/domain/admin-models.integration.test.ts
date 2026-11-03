import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseModelMetaForm } from "@/lib/schemas/model-meta";
import { db, pool as pgPool } from "@/server/db/client";
import { adminAuditLog, modelMeta } from "@/server/db/schema";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { adminDeleteModelMeta, adminUpsertModelMeta, getModelMeta, listModelMeta } from "./admin-models";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const actor = { id: "admin-1", ip: "198.51.100.4" };

function form(over: Record<string, string> = {}) {
  const r = parseModelMetaForm({ modelName: "gpt-5", provider: "openai", contextIn: "400000", cap_text: "on", cap_reasoning: "on", officialInputUsdPerM: "1.25", officialOutputUsdPerM: "10", visible: "on", ...over });
  if (!r.success) throw new Error("fixture form is invalid");
  return r.data;
}

describe("adminUpsertModelMeta", () => {
  it("creates a row and audits it", async () => {
    expect(await adminUpsertModelMeta(actor, form())).toEqual({ created: true });
    expect(await getModelMeta("gpt-5")).toMatchObject({ provider: "openai", contextIn: 400_000, contextOut: null, capabilities: ["text", "reasoning"], officialInputUsdPerM: "1.2500", visible: true });
    const [audit] = await db.select().from(adminAuditLog);
    expect(audit).toMatchObject({ actorId: "admin-1", action: "model_meta.create", target: "model_meta:gpt-5", before: null });
  });

  it("updates the same model name in place and records before and after", async () => {
    await adminUpsertModelMeta(actor, form());
    expect(await adminUpsertModelMeta(actor, form({ provider: "OpenAI", visible: "", officialInputUsdPerM: "", officialOutputUsdPerM: "" }))).toEqual({ created: false });

    expect(await listModelMeta()).toHaveLength(1);
    expect(await getModelMeta("gpt-5")).toMatchObject({ provider: "OpenAI", visible: false, officialInputUsdPerM: null });
    const audits = await db.select().from(adminAuditLog);
    expect(audits.map((a) => a.action)).toEqual(["model_meta.create", "model_meta.update"]);
    expect(audits[1]).toMatchObject({ before: { provider: "openai", visible: true }, after: { provider: "OpenAI", visible: false } });
    expect((await db.select().from(modelMeta))[0].modelName).toBe("gpt-5");
  });
});

describe("adminDeleteModelMeta", () => {
  it("removes the row and audits the catalog data it had", async () => {
    await adminUpsertModelMeta(actor, form());
    await adminDeleteModelMeta(actor, "gpt-5");

    expect(await getModelMeta("gpt-5")).toBeNull();
    const audits = await db.select().from(adminAuditLog);
    expect(audits.map((a) => a.action)).toEqual(["model_meta.create", "model_meta.delete"]);
    expect(audits[1]).toMatchObject({ actorId: "admin-1", target: "model_meta:gpt-5", before: { modelName: "gpt-5", provider: "openai", contextIn: 400_000, capabilities: ["text", "reasoning"], visible: true }, after: null });
  });

  it("refuses an unknown name and writes no audit row", async () => {
    await expect(adminDeleteModelMeta(actor, "nope")).rejects.toThrow("Metadata model tidak ditemukan.");
    expect(await db.select().from(adminAuditLog)).toHaveLength(0);
  });

  it("a model saved again after deletion is a new row", async () => {
    await adminUpsertModelMeta(actor, form());
    await adminDeleteModelMeta(actor, "gpt-5");
    expect(await adminUpsertModelMeta(actor, form())).toEqual({ created: true });
  });
});
