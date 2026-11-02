import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Settings-style block: title and description on the left, the content (rows or a form) on the right. One column on phones. */
export function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 px-5", className)}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:gap-8">
        <div>
          <h2 className="text-base font-medium text-heading">{title}</h2>
          {description && <p className="mt-1 text-sm leading-relaxed text-fg-muted">{description}</p>}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </Card>
  );
}

/** Label/value line for the right side of a SectionCard. Use inside a <dl>. */
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
      <dt className="mono-label">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-sm text-fg">{children}</dd>
    </div>
  );
}
