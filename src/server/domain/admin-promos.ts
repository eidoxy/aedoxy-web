import { desc, eq, inArray, sql } from "drizzle-orm";
import type { PromoInput } from "@/lib/schemas/promo";
import { db } from "@/server/db/client";
import { orders, plans, promotions } from "@/server/db/schema";
import { AdminError, writeAudit, type Actor } from "./audit";

/** Admin side of promotions (F06). Every change and its audit row share one transaction. */

type PromoRow = typeof promotions.$inferSelect;
export type PromoStatus = "scheduled" | "active" | "ended";

/** Stopped or past its end = ended; before its start = scheduled. A used-up quota is still "active" (the table shows usage). */
export function promoStatus(p: Pick<PromoRow, "enabled" | "startsAt" | "endsAt">, now: Date): PromoStatus {
  if (!p.enabled || (p.endsAt && p.endsAt <= now)) return "ended";
  if (p.startsAt && p.startsAt > now) return "scheduled";
  return "active";
}

export type PromoListItem = PromoRow & { status: PromoStatus; totalDiscountIdr: number; paidOrders: number };

export async function listPromos(now = new Date()): Promise<PromoListItem[]> {
  const [rows, totals] = await Promise.all([
    db.select().from(promotions).orderBy(desc(promotions.id)),
    db
      .select({
        id: orders.promotionId,
        discount: sql<number>`coalesce(sum(${orders.discountIdr}), 0)`.mapWith(Number),
        n: sql<number>`count(*)`.mapWith(Number),
      })
      .from(orders)
      .where(sql`${orders.promotionId} is not null and ${orders.status} = 'paid'`)
      .groupBy(orders.promotionId),
  ]);
  const byId = new Map(totals.map((t) => [t.id, t]));
  return rows.map((r) => ({ ...r, status: promoStatus(r, now), totalDiscountIdr: byId.get(r.id)?.discount ?? 0, paidOrders: byId.get(r.id)?.n ?? 0 }));
}

const editable = (p: PromoRow) => ({
  name: p.name,
  code: p.code,
  kind: p.kind,
  value: p.value,
  planIds: p.planIds,
  startsAt: p.startsAt,
  endsAt: p.endsAt,
  maxRedemptions: p.maxRedemptions,
  perUserLimit: p.perUserLimit,
  enabled: p.enabled,
});

const isUniqueViolation = (err: unknown) => (err as { cause?: { code?: string }; code?: string } | null)?.cause?.code === "23505" || (err as { code?: string } | null)?.code === "23505";

export async function createPromo(actor: Actor, input: PromoInput, now = new Date()): Promise<PromoRow> {
  if (input.endsAt && input.endsAt <= now) throw new AdminError("Akhir periode sudah lewat.");
  try {
    return await db.transaction(async (tx) => {
      if (input.planIds.length > 0) {
        const found = await tx.select({ id: plans.id }).from(plans).where(inArray(plans.id, input.planIds));
        if (found.length !== new Set(input.planIds).size) throw new AdminError("Ada paket yang tidak ditemukan.");
      }
      const [row] = await tx
        .insert(promotions)
        .values({ ...input, planIds: [...new Set(input.planIds)].sort((a, b) => a - b) })
        .returning();
      await writeAudit(tx, { actor, action: "promo.create", target: `promo:${row.id}`, after: editable(row) });
      return row;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new AdminError("Kode itu sudah dipakai promo lain (huruf besar/kecil dianggap sama).");
    throw err;
  }
}

/** "Hentikan sekarang": no new redemptions. Orders already holding a reservation keep it and settle or expire normally. */
export async function stopPromo(actor: Actor, id: number) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(promotions).where(eq(promotions.id, id)).for("update");
    if (!before) throw new AdminError("Promo tidak ditemukan.");
    if (!before.enabled) throw new AdminError("Promo ini sudah dihentikan.");
    const [after] = await tx.update(promotions).set({ enabled: false }).where(eq(promotions.id, id)).returning();
    await writeAudit(tx, { actor, action: "promo.stop", target: `promo:${id}`, before: editable(before), after: editable(after) });
    return after;
  });
}
