import type { ReactNode } from "react";

// comment | string | keyword | function call. Good enough for the short samples we show.
const TOKEN =
  /(#.*$|(?<![:\w/])\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(from|import|const|await|new|True|False|true|false)\b|\b([A-Za-z_][\w.]*)(?=\()/g;

const CLASS = ["text-faint", "text-tok-str", "text-tok-kw", "text-tok-fn"] as const;

/** Colours one source line with theme-aware token classes. */
export function highlightLine(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    if (start > last) out.push(line.slice(last, start));
    const group = m.findIndex((g, i) => i > 0 && g !== undefined) - 1;
    out.push(
      <span key={start} className={CLASS[group]}>
        {m[0]}
      </span>,
    );
    last = start + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}
