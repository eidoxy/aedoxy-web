"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Copies `value` to the clipboard and says so for two seconds. `label` names the value for screen readers. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      // Clipboard needs a secure context and a user gesture; tell the user instead of failing silently.
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2_000);
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()} aria-label={`Salin ${label}`}>
      {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">{state === "copied" ? "Tersalin" : state === "failed" ? "Gagal menyalin" : "Salin"}</span>
    </Button>
  );
}
