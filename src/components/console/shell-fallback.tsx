import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shown while the gate checks the session. Deliberately neutral: grey blocks only, no menu labels, names or
 * role-specific text, so a visitor who is about to be refused never sees what the console contains.
 */
export function ShellFallback() {
  return (
    <div aria-hidden className="flex min-h-svh w-full bg-sidebar">
      <div className="hidden w-64 shrink-0 flex-col gap-3 p-4 md:flex">
        <Skeleton className="h-8 w-28 bg-line-strong" />
        <Skeleton className="mt-4 h-8 bg-line" />
        <Skeleton className="h-8 bg-line" />
        <Skeleton className="h-8 bg-line" />
        <Skeleton className="h-8 bg-line" />
      </div>
      <div className="flex-1 bg-background md:m-2 md:ml-0 md:rounded-xl md:shadow-sm">
        <div className="flex h-12 items-center border-b border-line px-4">
          <Skeleton className="size-6 bg-line" />
        </div>
        <div className="p-4 md:p-6">
          <Skeleton className="h-72 max-w-2xl rounded-[18px] bg-line" />
        </div>
      </div>
    </div>
  );
}
