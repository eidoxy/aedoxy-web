"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { highlightLine } from "@/lib/highlight";
import { buildSnippet, SNIPPET_LANGS, type SnippetLang } from "@/lib/snippets";
import { cn } from "@/lib/utils";

/** Hero card: tabbed code sample (python/node/curl), copy button, example response and model chips. */
export function CodePanel({ apiBaseUrl, modelIds }: { apiBaseUrl: string; modelIds: string[] }) {
  const [lang, setLang] = useState<SnippetLang>("python");
  const [model, setModel] = useState(modelIds[0] ?? "nama-model");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(id);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(buildSnippet(lang, apiBaseUrl, model));
      setCopied(true);
    } catch {
      // Clipboard API unavailable (insecure context or denied): leave the label unchanged.
    }
  }

  return (
    <div className="overflow-hidden rounded-[18px] bg-surface shadow-card-hover">
      <Tabs value={lang} onValueChange={(v) => setLang(v as SnippetLang)} className="gap-0">
        <div className="flex items-center justify-between border-b border-line px-3 sm:px-4">
          <TabsList variant="line" className="h-11 gap-0 p-0">
            {SNIPPET_LANGS.map((l) => (
              <TabsTrigger key={l} value={l} className="h-11 flex-none rounded-none px-3 font-mono text-[13px] after:bottom-0">
                {l}
              </TabsTrigger>
            ))}
          </TabsList>
          <Button
            type="button"
            variant="ghost"
            onClick={copy}
            className="h-auto gap-1.5 rounded-md px-2 py-1.5 font-mono text-xs text-fg-muted hover:bg-transparent hover:text-fg dark:hover:bg-transparent"
          >
            {copied ? <Check className="size-3.5 text-primary-ink" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? "Disalin" : "Salin"}
            <span className="sr-only" aria-live="polite">
              {copied ? "Kode disalin ke clipboard" : ""}
            </span>
          </Button>
        </div>
        {SNIPPET_LANGS.map((l) => {
          const lines = buildSnippet(l, apiBaseUrl, model).split("\n");
          return (
            <TabsContent key={l} value={l} className="m-0 overflow-x-auto py-3.5">
              <pre className="min-w-max font-mono text-[13px] leading-[21px] text-fg">
                {lines.map((text, i) => (
                  <code
                    key={i}
                    className={cn("block px-4", text.includes(model) && "bg-primary-tint")}
                  >
                    <span aria-hidden className="mr-4 inline-block w-4 text-right text-faint select-none">
                      {i + 1}
                    </span>
                    {highlightLine(text)}
                    {"\n"}
                  </code>
                ))}
              </pre>
            </TabsContent>
          );
        })}
      </Tabs>

      <div className="border-t border-line bg-surface-2 px-4 py-3.5 font-mono text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-fg-muted">
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-success" aria-hidden />
            200 OK
          </span>
          <span aria-hidden>·</span>
          <span>streaming</span>
          <span className="rounded border border-line-strong px-1.5 py-px text-[10px] tracking-wider text-faint uppercase">Contoh</span>
        </div>
        <p className="mt-3 font-sans text-[15px] text-fg">
          Halo! Ada yang bisa saya bantu? <span className="cursor-blink text-fg" aria-hidden />
        </p>
        {modelIds.length > 0 && (
          <ToggleGroup
            type="single"
            value={model}
            onValueChange={(v) => v && setModel(v)}
            aria-label="Pilih model untuk contoh kode"
            className="mt-3 w-full flex-wrap"
          >
            <span className="text-faint">coba →</span>
            {modelIds.map((id) => (
              <ToggleGroupItem
                key={id}
                value={id}
                className="h-auto min-w-0 rounded-md border border-transparent px-2 py-1 font-mono text-xs font-normal text-fg-muted hover:bg-transparent hover:text-fg data-[state=on]:border-primary-ink/30 data-[state=on]:bg-primary-tint data-[state=on]:text-primary-ink data-[state=on]:hover:bg-primary-tint data-[state=on]:hover:text-primary-ink"
              >
                {id}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>
    </div>
  );
}
