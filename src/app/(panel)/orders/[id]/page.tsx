import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderTracker } from "@/components/panel/order-tracker";
import { getOrderForUser, planNameOf } from "@/server/domain/order-view";
import { requireSession } from "@/server/session";

export const metadata: Metadata = { title: "Detail pesanan" };

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div aria-hidden className="h-72 max-w-2xl rounded-[18px] border border-line bg-surface" />}>
      <Order params={params} />
    </Suspense>
  );
}

async function Order({ params }: { params: Promise<{ id: string }> }) {
  const { user } = await requireSession();
  const { id } = await params;
  const order = await getOrderForUser(id, user.id);
  if (!order) notFound();

  return (
    <OrderTracker
      order={{
        id: order.id,
        tradeNo: order.tradeNo,
        planName: planNameOf(order),
        amountIdr: order.amountIdr,
        paymentUrl: order.paymentUrl,
        status: order.status,
        fulfillment: order.fulfillment,
        expiresAt: order.expiresAt.toISOString(),
      }}
    />
  );
}
