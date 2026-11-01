import { eq, or } from "drizzle-orm";
import { env } from "@/env";
import { db } from "@/server/db/client";
import { orders, webhookEvents } from "@/server/db/schema";
import { extractWebhookRefs, getInvoice, isUuid, PoketoError, verifyPoketoSignature } from "@/server/integrations/poketo";
import { cancelOrder, expireOrder, markOrderRefunded, settleOrderPaid } from "./orders";

/**
 * POST /api/webhooks/poketo (TRD 9.3, F01). Reply codes: 401 for a bad,
 * stale or unconfigured signature; 500 only for failures that a retry can fix
 * (database, Poketo unreachable); 200 for everything a retry would not change.
 * Logs carry the event id, type and trade_no, never the body or signature.
 */

const ok = (result: string) => Response.json({ ok: true, result });

const HANDLED = new Set(["invoice.paid", "invoice.expired", "invoice.cancelled", "invoice.refunded"]);

function eventType(request: Request, payload: unknown): string | undefined {
  const header = request.headers.get("poketo-event");
  if (header) return header;
  const p = payload as { type?: unknown; event?: unknown } | null;
  const fromBody = p?.type ?? p?.event;
  return typeof fromBody === "string" ? fromBody : undefined;
}

async function findOrder(payload: unknown) {
  const { references, invoiceIds } = extractWebhookRefs(payload);
  for (const ref of references) {
    const [row] = await db
      .select()
      .from(orders)
      .where(isUuid(ref) ? or(eq(orders.tradeNo, ref), eq(orders.id, ref)) : eq(orders.tradeNo, ref))
      .limit(1);
    if (row) return row;
  }
  for (const id of invoiceIds) {
    const [row] = await db.select().from(orders).where(eq(orders.poketoInvoiceId, id)).limit(1);
    if (row) return row;
  }
  return undefined;
}

/** Re-reads the invoice from Poketo and applies its status, not the webhook's claim. */
async function processInvoiceEvent(type: string, payload: unknown, eventId: string): Promise<{ status: number; result: string }> {
  const order = await findOrder(payload);
  if (!order) {
    console.warn("[poketo-webhook] unknown order", { eventId, type });
    return { status: 200, result: "order_not_found" };
  }

  let invoice;
  try {
    invoice = await getInvoice(order.tradeNo);
  } catch (err) {
    if (err instanceof PoketoError && err.status === 404) return { status: 200, result: "invoice_not_found" };
    throw err;
  }

  if ((invoice.referenceId && invoice.referenceId !== order.tradeNo) || invoice.amount !== order.amountIdr) {
    console.error("[poketo-webhook] invoice does not match order, nothing credited", {
      eventId,
      tradeNo: order.tradeNo,
      invoiceAmount: invoice.amount,
      orderAmount: order.amountIdr,
    });
    return { status: 200, result: "mismatch" };
  }

  switch (invoice.status) {
    case "paid":
      return { status: 200, result: `paid:${await settleOrderPaid(order.id)}` };
    case "expired":
      return { status: 200, result: `expired:${await expireOrder(order.id)}` };
    case "cancelled":
      return { status: 200, result: `cancelled:${await cancelOrder(order.id)}` };
    case "refunded":
      return { status: 200, result: `refunded:${await markOrderRefunded(order.id)}` };
    default:
      // The event claimed a final state that the API does not show yet: ask Poketo to retry a paid claim.
      console.warn("[poketo-webhook] invoice not final yet", { eventId, type, tradeNo: order.tradeNo, status: invoice.status });
      return type === "invoice.paid" ? { status: 500, result: "status_not_confirmed" } : { status: 200, result: "not_final" };
  }
}

export async function handlePoketoWebhook(request: Request): Promise<Response> {
  const secret = env.POKETO_WEBHOOK_SECRET;
  // Never accept unsigned traffic: an empty secret rejects everything.
  if (!secret) return Response.json({ error: "webhook_not_configured" }, { status: 401 });

  const rawBody = await request.text();
  const verdict = verifyPoketoSignature(rawBody, request.headers.get("poketo-signature"), secret);
  if (!verdict.ok) {
    console.warn("[poketo-webhook] signature rejected", { reason: verdict.reason });
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    payload = undefined;
  }
  const type = eventType(request, payload);
  if (type === "ping") return ok("ping");

  const eventId = request.headers.get("poketo-event-id");
  if (!type || !eventId || eventId.length > 128 || typeof payload !== "object" || payload === null) {
    return ok("invalid_event");
  }

  try {
    const [inserted] = await db
      .insert(webhookEvents)
      .values({ eventId, eventType: type, deliveryId: request.headers.get("poketo-delivery") })
      .onConflictDoNothing({ target: webhookEvents.eventId })
      .returning({ id: webhookEvents.id });
    let rowId = inserted?.id;
    if (rowId === undefined) {
      const [existing] = await db.select().from(webhookEvents).where(eq(webhookEvents.eventId, eventId)).limit(1);
      if (!existing || existing.processedAt) return ok("duplicate");
      rowId = existing.id; // an earlier attempt failed before finishing: process again
    }

    const outcome = HANDLED.has(type) ? await processInvoiceEvent(type, payload, eventId) : { status: 200, result: "ignored" };
    if (outcome.status === 200) {
      await db.update(webhookEvents).set({ processedAt: new Date(), result: outcome.result }).where(eq(webhookEvents.id, rowId));
      return ok(outcome.result);
    }
    return Response.json({ error: outcome.result }, { status: outcome.status });
  } catch (err) {
    console.error("[poketo-webhook] processing failed", { eventId, type, error: err instanceof Error ? err.message : "unknown" });
    return Response.json({ error: "temporary_failure" }, { status: 500 });
  }
}
