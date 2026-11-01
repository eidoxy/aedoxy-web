import { Badge } from "@/components/ui/badge";
import { describeOrder, type FulfillmentStatus, type OrderStatus } from "@/lib/order-status";

export function OrderBadge({ status, fulfillment }: { status: OrderStatus; fulfillment: FulfillmentStatus | null }) {
  const { label, tone } = describeOrder({ status, fulfillment });
  return <Badge variant={tone === "success" ? "default" : tone === "danger" ? "destructive" : tone === "pending" ? "secondary" : "outline"}>{label}</Badge>;
}
