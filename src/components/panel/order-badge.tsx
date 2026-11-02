import { Badge } from "@/components/ui/badge";
import { describeOrder, type FulfillmentStatus, type GrantPhase, type OrderStatus, type OrderTone } from "@/lib/order-status";

export function ToneBadge({ label, tone }: { label: string; tone: OrderTone }) {
  return <Badge variant={tone === "success" ? "default" : tone === "danger" ? "destructive" : tone === "pending" ? "secondary" : "outline"}>{label}</Badge>;
}

export function OrderBadge({ status, fulfillment, grantPhase }: { status: OrderStatus; fulfillment: FulfillmentStatus | null; grantPhase?: GrantPhase | null }) {
  const { label, tone } = describeOrder({ status, fulfillment, grantPhase });
  return <ToneBadge label={label} tone={tone} />;
}
