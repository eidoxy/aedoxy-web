import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Card around a <Table>. The table scrolls inside the card (ui/table already wraps it in overflow-x-auto), so a wide
 * table never widens the page. Header and rows are styled here, not in ui/table, because the marketing catalog shares that one.
 */
export function TableCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden py-0",
        "[&_thead]:bg-muted/60 [&_th]:h-10 [&_th]:px-3 [&_th]:font-mono [&_th]:text-[11px] [&_th]:font-normal [&_th]:tracking-[0.08em] [&_th]:text-faint [&_th]:uppercase",
        "[&_td]:px-3 [&_td]:py-3 [&_tr]:border-line [&_tbody_tr:hover]:bg-muted/40",
        "[&_td:first-child]:pl-5 [&_th:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:last-child]:pr-5",
        className
      )}
      {...props}
    />
  );
}
