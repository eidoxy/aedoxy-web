import { highlightLine } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

/** Titled code card with a copy button. Long lines scroll inside the card, never the page. */
export function CodeBlock({ title, code, className }: { title: string; code: string; className?: string }) {
  return (
    <div className={cn("min-w-0 overflow-hidden rounded-[18px] border border-line bg-surface shadow-card", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-4">
        <span className="truncate font-mono text-xs text-fg-muted">{title}</span>
        <CopyButton value={code} className="shrink-0" />
      </div>
      <pre className="overflow-x-auto py-3.5 font-mono text-[13px] leading-[21px] text-fg" tabIndex={0}>
        {code.split("\n").map((line, i) => (
          <code key={i} className="block min-w-max px-4">
            {highlightLine(line)}
            {"\n"}
          </code>
        ))}
      </pre>
    </div>
  );
}
