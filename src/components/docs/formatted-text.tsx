import type { ReactNode } from "react";

// shortcut: only **bold** and `code`, no nesting or links; upgrade to a markdown renderer if the copy needs more.
export function FormattedText({ text }: { text: string }): ReactNode {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={i} className="font-medium text-heading">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-alt px-1 py-0.5 font-mono text-[0.85em] text-fg">
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      })}
    </>
  );
}
