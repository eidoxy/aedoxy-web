import { describeOrder, type OrderListItem } from "@/lib/order-status";
import { listOrdersForUser, planNameOf } from "@/server/domain/order-view";
import { getSession } from "@/server/session";

/** The signed-in user's own order history (newest first). The query is scoped to the session user, so nobody else's order can appear. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401, headers });

  const rows = await listOrdersForUser(session.user.id);
  const orders: OrderListItem[] = rows.map((o) => {
    const { label, tone } = describeOrder(o);
    return {
      id: o.id,
      createdAt: o.createdAt.toISOString(),
      planName: planNameOf(o),
      amountIdr: o.amountIdr,
      statusLabel: label,
      tone,
      pending: o.status === "pending",
    };
  });
  return Response.json({ orders }, { headers });
}
