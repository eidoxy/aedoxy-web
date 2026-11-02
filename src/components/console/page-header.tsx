import { cn } from "@/lib/utils";

/** Heading block shared by every console page: eyebrow, the page's only h1, optional description, actions on the right. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className={cn("text-2xl font-medium tracking-[-0.03em] text-heading sm:text-3xl", eyebrow && "mt-2")}>{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
