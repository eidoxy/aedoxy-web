import { getOrderForUser } from "@/server/domain/order-view";
import { getSession } from "@/server/session";

/** Polled by the order page. Owner only: a missing order and someone else's order both answer 404. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });

  const { id } = await ctx.params;
  const order = await getOrderForUser(id, session.user.id);
  if (!order) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });

  return Response.json(
    { status: order.status, fulfillment: order.fulfillment, expiresAt: order.expiresAt.toISOString(), paidAt: order.paidAt?.toISOString() ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
