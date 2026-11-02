"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDocs } from "./docs-provider";

/** Copies `value` and confirms inline ("Disalin") plus a polite live-region announcement. */
export function CopyButton({ value, className }: { value: string; className?: string }) {
  const { t } = useDocs();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // Clipboard API unavailable (insecure context or denied): leave the label unchanged.
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={copy}
      className={cn("h-7 gap-1.5 rounded-md px-2 font-mono text-xs text-fg-muted hover:bg-transparent hover:text-fg dark:hover:bg-transparent", className)}
    >
      {copied ? <Check className="size-3.5 text-primary-ink" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? t.common.copied : t.common.copy}
      <span className="sr-only" aria-live="polite">
        {copied ? t.common.copiedAnnounce : ""}
      </span>
    </Button>
  );
}
