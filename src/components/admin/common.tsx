import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card as UiCard } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const adminDate = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

/** Plain block with the card chrome: children bring their own spacing. For tables use TableCard. */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <UiCard className={cn("gap-0 px-5", className)} {...props} />;
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "danger" | "success" | "warn" }) {
  return (
    <Card>
      <p className="mono-label">{label}</p>
      <p
        className={cn(
          "mt-2 text-3xl leading-none font-medium tracking-[-0.04em] text-heading",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
          tone === "warn" && "text-warn",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
    </Card>
  );
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Native select: posts a plain value in FormData and works without client JS. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(selectClass, className)} {...props} />;
}

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mono-label mb-1.5 block">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-faint">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const PAGE_SIZE = 25;

/** Previous/next links that keep the other query parameters. */
export function Pagination({ basePath, params, page, total, pageSize = PAGE_SIZE }: { basePath: string; params: Record<string, string | undefined>; page: number; total: number; pageSize?: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-fg-muted">
      <span>
        {total} baris · halaman {page} dari {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page - 1)}>Sebelumnya</Link>
          </Button>
        ) : null}
        {page < pages ? (
          <Button asChild variant="outline" size="sm">
            <Link href={href(page + 1)}>Berikutnya</Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** First string of a search parameter, trimmed; undefined when empty. */
export function param(v: string | string[] | undefined): string | undefined {
  const s = (Array.isArray(v) ? v[0] : v)?.trim();
  return s ? s : undefined;
}

export function pageParam(v: string | string[] | undefined): number {
  const n = Number(param(v));
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
