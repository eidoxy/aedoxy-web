import { asc, eq } from "drizzle-orm";
import type { ModelMetaInput } from "@/lib/schemas/model-meta";
import { db } from "@/server/db/client";
import { modelMeta } from "@/server/db/schema";
import { writeAudit, type Actor } from "./audit";

/** Admin side of model_meta (F08). The upsert and its audit row share one transaction. */

type MetaRow = typeof modelMeta.$inferSelect;

export const listModelMeta = (): Promise<MetaRow[]> => db.select().from(modelMeta).orderBy(asc(modelMeta.provider), asc(modelMeta.modelName));

export const getModelMeta = async (modelName: string): Promise<MetaRow | null> => (await db.select().from(modelMeta).where(eq(modelMeta.modelName, modelName)))[0] ?? null;

const editable = (m: MetaRow | ModelMetaInput) => ({
  modelName: m.modelName,
  provider: m.provider,
  contextIn: m.contextIn,
  contextOut: m.contextOut,
  capabilities: m.capabilities,
  officialInputUsdPerM: m.officialInputUsdPerM,
  officialOutputUsdPerM: m.officialOutputUsdPerM,
  visible: m.visible,
});

/** Creates the row or updates the one with the same model name. */
export async function adminUpsertModelMeta(actor: Actor, input: ModelMetaInput) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(modelMeta).where(eq(modelMeta.modelName, input.modelName)).for("update");
    const values = { ...input, capabilities: [...new Set(input.capabilities)] };
    await tx
      .insert(modelMeta)
      .values(values)
      .onConflictDoUpdate({ target: modelMeta.modelName, set: values });
    await writeAudit(tx, {
      actor,
      action: before ? "model_meta.update" : "model_meta.create",
      target: `model_meta:${input.modelName}`,
      before: before ? editable(before) : undefined,
      after: editable(values),
    });
    return { created: !before };
  });
}
