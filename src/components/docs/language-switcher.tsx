"use client";

import { Languages } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DocsLang } from "@/lib/docs/snippets";
import { useDocs } from "./docs-provider";

const OPTIONS: { code: DocsLang; short: string; label: string }[] = [
  { code: "id", short: "ID", label: "Bahasa Indonesia" },
  { code: "en", short: "EN", label: "English" },
];

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useDocs();
  return (
    <div className="flex items-center gap-2">
      <Languages className="size-4 text-faint" aria-hidden />
      <ToggleGroup
        type="single"
        value={language}
        onValueChange={(v) => v && setLanguage(v as DocsLang)}
        aria-label={t.common.switchLanguage}
        spacing={1}
        className="rounded-lg border border-line bg-surface p-0.5"
      >
        {OPTIONS.map((o) => (
          <ToggleGroupItem
            key={o.code}
            value={o.code}
            aria-label={o.label}
            lang={o.code}
            className="h-7 min-w-8 px-2 font-mono text-xs font-medium text-fg-muted hover:bg-line data-[state=on]:bg-line data-[state=on]:text-heading"
          >
            {o.short}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
