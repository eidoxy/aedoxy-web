import { Badge } from "@/components/ui/badge";
import { describeOrder, type FulfillmentStatus, type GrantPhase, type OrderStatus } from "@/lib/order-status";

export function OrderBadge({ status, fulfillment, grantPhase }: { status: OrderStatus; fulfillment: FulfillmentStatus | null; grantPhase?: GrantPhase | null }) {
  const { label, tone } = describeOrder({ status, fulfillment, grantPhase });
  return <Badge variant={tone === "success" ? "default" : tone === "danger" ? "destructive" : tone === "pending" ? "secondary" : "outline"}>{label}</Badge>;
}
