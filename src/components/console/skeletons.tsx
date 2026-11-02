import { TableCard } from "@/components/console/table-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Placeholders for console pages (user panel and admin). Each block copies the size of the real content (PageHeader,
 * Stat, Card, TableCard, form rows) so the page does not jump when the data arrives. The blocks are decorative
 * (aria-hidden); <SkeletonRegion> adds one busy status for screen readers around a whole placeholder.
 * Deliberately neutral: grey blocks only, no role-specific text.
 */

const bar = "bg-line";

export function SkeletonRegion({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Memuat...</span>
      <div aria-hidden className={className}>
        {children}
      </div>
    </div>
  );
}

export function PageHeaderSkeleton({ description = true }: { description?: boolean }) {
  return (
    <div aria-hidden className="space-y-2">
      <Skeleton className={cn("h-4 w-20", bar)} />
      <Skeleton className={cn("mt-2 h-8 w-64 max-w-full sm:h-9", bar)} />
      {description && <Skeleton className={cn("h-5 w-full max-w-xl", bar)} />}
    </div>
  );
}

/** Same grid as the Stat cards on the admin overview and pool pages. */
export function StatCardsSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-[18px] border border-line bg-surface px-5 py-5">
          <Skeleton className={cn("h-3.5 w-20", bar)} />
          <Skeleton className={cn("mt-3 h-8 w-28", bar)} />
          <Skeleton className={cn("mt-3 h-3.5 w-40 max-w-full", bar)} />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("space-y-3 rounded-[18px] border border-line bg-surface p-5", className)}>
      <Skeleton className={cn("h-5 w-40", bar)} />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn("h-4", i === lines - 1 ? "w-2/3" : "w-full", bar)} />
      ))}
    </div>
  );
}

/** Table card with a header row and `rows` rows of `cols` cells; the first column is a little wider like the real ones. */
export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <TableCard aria-hidden>
      <div className="flex h-10 items-center gap-6 bg-muted/60 px-5">
        {Array.from({ length: cols }, (_, j) => (
          <Skeleton key={j} className={cn("h-3", j === 0 ? "w-24" : "w-16", bar)} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-[3.25rem] items-center gap-6 border-t border-line px-5">
          {Array.from({ length: cols }, (_, j) => (
            <Skeleton key={j} className={cn("h-4", j === 0 ? "w-28" : "w-20", bar)} />
          ))}
        </div>
      ))}
    </TableCard>
  );
}

/** Labelled inputs stacked like the console forms, ending in a button. */
export function FormSkeleton({ fields = 3, className }: { fields?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("space-y-5 rounded-[18px] border border-line bg-surface p-5", className)}>
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className={cn("h-3.5 w-24", bar)} />
          <Skeleton className={cn("h-9 w-full", bar)} />
        </div>
      ))}
      <Skeleton className={cn("h-10 w-28", bar)} />
    </div>
  );
}

/** Whole-page presets, used by loading.tsx and by the pages' own <Suspense> fallbacks. */
export function TablePageSkeleton({ filters = false, stats = 0, rows = 8, cols = 6 }: { filters?: boolean; stats?: number; rows?: number; cols?: number }) {
  return (
    <SkeletonRegion className="space-y-6">
      <PageHeaderSkeleton />
      {stats > 0 && <StatCardsSkeleton count={stats} />}
      {filters && <CardSkeleton lines={1} />}
      <TableSkeleton rows={rows} cols={cols} />
    </SkeletonRegion>
  );
}

export function StatsPageSkeleton({ stats = 3, cards = 2 }: { stats?: number; cards?: number }) {
  return (
    <SkeletonRegion className="space-y-6">
      <PageHeaderSkeleton />
      <StatCardsSkeleton count={stats} />
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: cards }, (_, i) => (
          <CardSkeleton key={i} lines={4} />
        ))}
      </div>
    </SkeletonRegion>
  );
}

export function CardsPageSkeleton({ cards = 3, narrow = false }: { cards?: number; narrow?: boolean }) {
  return (
    <SkeletonRegion className="space-y-6">
      <PageHeaderSkeleton />
      <div className={cn("grid gap-4", narrow ? "max-w-2xl" : "md:grid-cols-2 xl:grid-cols-3")}>
        {Array.from({ length: cards }, (_, i) => (
          <CardSkeleton key={i} lines={5} />
        ))}
      </div>
    </SkeletonRegion>
  );
}

export function FormPageSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <SkeletonRegion className="space-y-6">
      <PageHeaderSkeleton />
      <FormSkeleton fields={fields} className="max-w-2xl" />
    </SkeletonRegion>
  );
}
