import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OrderTracker } from "@/components/panel/order-tracker";
import { getOrderForUser, planNameOf } from "@/server/domain/order-view";
import { requireSession } from "@/server/session";
import { CardsPageSkeleton } from "@/components/console/skeletons";

export const metadata: Metadata = { title: "Detail pesanan" };

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<CardsPageSkeleton cards={1} narrow />}>
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
        grantPhase: order.grantPhase,
        expiresAt: order.expiresAt.toISOString(),
      }}
    />
  );
}
