"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parsePlanForm } from "@/lib/schemas/plan";
import { getAdminActor, requireAdmin, requireFreshTotp } from "@/server/admin";
import { formStrings, toActionError, type AdminFormState } from "@/server/admin-action";
import { assertUpgradeGroupAllowed, createPlan, duplicatePlan, movePlan, pushSortOrdersBestEffort, setPlanEnabled, setPlanPrice, syncPlansBestEffort, updatePlan } from "@/server/domain/admin-plans";
import { AdminError } from "@/server/domain/audit";

const SYNC_FAILED = "Tersimpan, tetapi sinkron ke New API gagal. Paket belum bisa dibeli sampai sinkron berhasil (dicoba ulang tiap jam).";

function refresh() {
  revalidatePath("/admin/plans");
  revalidatePath("/plans");
}

const planId = z.coerce.number().int().positive();

/** Create (no planId), update, or "save as new plan" (intent=save_as_new). Returns state; a successful create redirects to the list. */
export async function savePlanAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const raw = formStrings(formData);
  const parsed = parsePlanForm(raw);
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  const existingId = raw.planId ? planId.safeParse(raw.planId) : null;
  if (existingId && !existingId.success) return { error: "Paket tidak valid." };

  let created = false;
  let syncFailed = false;
  try {
    await requireFreshTotp(raw.totp ?? "");
    await assertUpgradeGroupAllowed(parsed.data.upgradeGroup, existingId?.data);
    const actor = await getAdminActor(session);
    if (!existingId || raw.intent === "save_as_new") {
      const plan = await createPlan(actor, parsed.data);
      created = true;
      syncFailed = plan.enabled && (await syncPlansBestEffort([plan.id])).some((s) => !s.ok);
    } else {
      const r = await updatePlan(actor, existingId.data, parsed.data, { confirmCreditChange: raw.confirmCreditChange === "on" });
      syncFailed = r.needsSync && (await syncPlansBestEffort([r.plan.id])).some((s) => !s.ok);
    }
  } catch (err) {
    if (err instanceof AdminError && err.code === "CREDIT_CHANGE_NEEDS_CONFIRM") return { confirm: err.message };
    return toActionError(err);
  }
  refresh();
  if (created && !syncFailed) redirect("/admin/plans");
  return { ok: syncFailed ? SYNC_FAILED : created ? "Paket baru dibuat." : "Tersimpan dan tersinkron." };
}

const priceInput = z.object({ planId, priceIdr: z.string().trim().regex(/^\d+$/, "Harga harus bilangan bulat.").transform(Number), totp: z.string().default("") });

export async function setPriceAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = priceInput.safeParse(formStrings(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    await requireFreshTotp(parsed.data.totp);
    await setPlanPrice(await getAdminActor(session), parsed.data.planId, parsed.data.priceIdr);
  } catch (err) {
    return toActionError(err);
  }
  refresh();
  return { ok: "Harga disimpan. Berlaku untuk order baru." };
}

const enabledInput = z.object({ planId, enabled: z.enum(["true", "false"]), totp: z.string().default("") });

export async function setEnabledAction(_prev: AdminFormState, formData: FormData): Promise<AdminFormState> {
  const session = await requireAdmin();
  const parsed = enabledInput.safeParse(formStrings(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try {
    await requireFreshTotp(parsed.data.totp);
    const r = await setPlanEnabled(await getAdminActor(session), parsed.data.planId, parsed.data.enabled === "true");
    if (r.needsSync && (await syncPlansBestEffort([r.plan.id])).some((s) => !s.ok)) {
      refresh();
      return { ok: SYNC_FAILED };
    }
  } catch (err) {
    return toActionError(err);
  }
  refresh();
  return { ok: parsed.data.enabled === "true" ? "Paket diaktifkan." : "Paket dinonaktifkan." };
}

/** Plain form actions: no fresh 2FA (a copy is a disabled draft; reordering changes no price or credit). They still require an admin. */
export async function duplicatePlanAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = planId.safeParse(formData.get("planId"));
  if (!id.success) return;
  const copy = await duplicatePlan(await getAdminActor(session), id.data);
  refresh();
  redirect(`/admin/plans/${copy.id}`);
}

export async function movePlanAction(formData: FormData): Promise<void> {
  const session = await requireAdmin();
  const id = planId.safeParse(formData.get("planId"));
  const direction = z.enum(["up", "down"]).safeParse(formData.get("direction"));
  if (!id.success || !direction.success) return;
  const changed = await movePlan(await getAdminActor(session), id.data, direction.data);
  await pushSortOrdersBestEffort(changed);
  refresh();
}
