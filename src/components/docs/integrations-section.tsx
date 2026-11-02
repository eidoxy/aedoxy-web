"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TOOLS } from "@/lib/docs/sections";
import { CodeBlock } from "./code-block";
import { useDocs } from "./docs-provider";
import { FormattedText } from "./formatted-text";
import { SectionHeading } from "./section-heading";

const toolValue = (anchor: string) => anchor.replace(/^tool-/, "");

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="my-5 grid gap-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-3 text-sm text-fg-muted">
          <span className="grid size-6 shrink-0 place-items-center rounded-md border border-line-strong font-mono text-xs text-heading">{i + 1}</span>
          <span className="pt-0.5">
            <FormattedText text={item} />
          </span>
        </li>
      ))}
    </ol>
  );
}

function SettingGrid({ items, className = "sm:grid-cols-2" }: { items: [string, string][]; className?: string }) {
  return (
    <dl className={`grid gap-2 ${className}`}>
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-xl border border-line bg-surface-2 p-3">
          <dt className="mono-label">{label}</dt>
          <dd className="mt-1 truncate font-mono text-[13px] text-fg">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Note({ text }: { text: string }) {
  return (
    <p className="mt-4 text-xs leading-relaxed text-faint">
      <FormattedText text={text} />
    </p>
  );
}

function CodeTabs({ tabs, defaultValue }: { defaultValue: string; tabs: { value: string; label: string; title: string; code: string }[] }) {
  return (
    <Tabs defaultValue={defaultValue} className="gap-3">
      <div className="overflow-x-auto">
        <TabsList variant="line" className="h-10 gap-0 border-b border-line p-0">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="h-10 flex-none rounded-none px-3 text-[13px] after:bottom-0">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          <CodeBlock title={tab.title} code={tab.code} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ToolItem({ anchor, description, protocol, children }: { anchor: string; description: string; protocol: string; children: ReactNode }) {
  const tool = TOOLS.find((x) => x.id === anchor)!;
  return (
    <AccordionItem value={toolValue(anchor)} id={anchor} className="scroll-mt-28 rounded-[18px] border border-line bg-surface px-4 shadow-card not-last:border-b">
      <AccordionTrigger className="min-h-14 items-center py-3 hover:no-underline">
        <span className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-2 font-mono text-[11px] font-medium text-heading" aria-hidden>
            {tool.mark}
          </span>
          <span className="grid min-w-0 text-left">
            <span className="text-[15px] font-medium text-heading">{tool.name}</span>
            <span className="truncate text-xs font-normal text-fg-muted">{description}</span>
          </span>
          <Badge variant="outline" className="mr-2 ml-auto hidden border-line-strong font-mono text-[11px] text-fg-muted sm:inline-flex">
            {protocol}
          </Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent className="border-t border-line pt-5 pb-5 sm:px-2">{children}</AccordionContent>
    </AccordionItem>
  );
}

export function IntegrationsSection() {
  const { t, snippets, brandName } = useDocs();
  const i = t.integrasi;
  const { codes, openaiUrl, apiKey, model } = snippets;
  const [open, setOpen] = useState<string[]>([toolValue(TOOLS[0].id)]);

  // A rail or shortcut link (#tool-x) opens the matching card. The browser scrolls to it on its own.
  useEffect(() => {
    const sync = () => {
      const hit = TOOLS.find((x) => x.id === window.location.hash.slice(1));
      if (hit) setOpen((v) => (v.includes(toolValue(hit.id)) ? v : [...v, toolValue(hit.id)]));
    };
    const frame = requestAnimationFrame(sync);
    window.addEventListener("hashchange", sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  return (
    <section id="integrasi" className="scroll-mt-28 border-t border-line py-16">
      <SectionHeading number={i.number} eyebrow={i.eyebrow} title={i.title} description={i.description} />
      <ul className="mb-6 flex flex-wrap gap-2" aria-label={i.shortcuts}>
        {TOOLS.map((tool) => (
          <li key={tool.id}>
            <a
              href={`#${tool.id}`}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-line-strong bg-surface px-3 text-[13px] font-medium text-fg-muted transition-colors hover:text-heading"
            >
              <span className="font-mono text-[10px] text-faint" aria-hidden>
                {tool.mark}
              </span>
              {tool.name}
            </a>
          </li>
        ))}
      </ul>

      <Accordion type="multiple" value={open} onValueChange={setOpen} className="grid gap-3">
        <ToolItem anchor="tool-9router" description={i.router.description} protocol={i.router.protocol}>
          <p className="text-sm text-fg-muted">{i.router.intro}</p>
          <Steps items={i.router.steps} />
          <SettingGrid
            items={[
              ["Name", brandName],
              ["Base URL", openaiUrl],
              ["API Key", apiKey],
              ["Model", model],
            ]}
          />
          <Note text={i.router.note} />
        </ToolItem>

        <ToolItem anchor="tool-claude" description={i.claude.description} protocol={i.claude.protocol}>
          <p className="mb-5 text-sm text-fg-muted">
            <FormattedText text={i.claude.intro} />
          </p>
          <CodeTabs
            defaultValue="windows"
            tabs={[
              { value: "windows", label: i.claude.tabs.windows, title: "PowerShell", code: codes.claudeWindows },
              { value: "unix", label: i.claude.tabs.unix, title: "Terminal", code: codes.claudeUnix },
              { value: "json", label: i.claude.tabs.json, title: "~/.claude/settings.json", code: codes.claudeJson },
            ]}
          />
          <Note text={i.claude.note} />
        </ToolItem>

        <ToolItem anchor="tool-codex" description={i.codex.description} protocol={i.codex.protocol}>
          <p className="mb-5 text-sm text-fg-muted">
            <FormattedText text={i.codex.intro} />
          </p>
          <CodeBlock title="~/.codex/config.toml" code={codes.codexConfig} />
          <CodeBlock className="mt-3" title="PowerShell" code={codes.codexRun} />
          <Note text={i.codex.note} />
        </ToolItem>

        <ToolItem anchor="tool-opencode" description={i.opencode.description} protocol={i.opencode.protocol}>
          <p className="mb-5 text-sm text-fg-muted">
            <FormattedText text={i.opencode.intro} />
          </p>
          <CodeBlock title="opencode.jsonc" code={codes.opencode} />
          <Note text={i.opencode.note} />
        </ToolItem>

        <ToolItem anchor="tool-cursor" description={i.cursor.description} protocol={i.cursor.protocol}>
          <Steps items={i.cursor.steps} />
          <SettingGrid className="sm:grid-cols-3" items={[["OpenAI API Key", apiKey], ["Override Base URL", openaiUrl], ["Model", model]]} />
          <Alert variant="warning" className="mt-4">
            <TriangleAlert aria-hidden />
            <AlertTitle>{i.cursor.warningTitle}</AlertTitle>
            <AlertDescription>
              <FormattedText text={i.cursor.warningDescription} />
            </AlertDescription>
          </Alert>
        </ToolItem>

        <ToolItem anchor="tool-sdk" description={i.sdk.description} protocol={i.sdk.protocol}>
          <CodeTabs
            defaultValue="curl"
            tabs={[
              { value: "curl", label: "cURL", title: "Chat Completions", code: codes.curl },
              { value: "javascript", label: "JavaScript", title: "JavaScript · openai", code: codes.javascript },
              { value: "python", label: "Python", title: "Python · openai", code: codes.python },
              { value: "anthropic", label: "Anthropic", title: "cURL · Anthropic Messages", code: codes.anthropic },
            ]}
          />
        </ToolItem>
      </Accordion>
    </section>
  );
}
