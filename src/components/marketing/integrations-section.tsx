"use client";

import { ArrowRight, Plus } from "lucide-react";
import { useState, type ComponentType, type SVGProps } from "react";
import { ClaudeCode, Cline, Cursor, OpenCode } from "@/components/brand/icons";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

interface Agent {
  id: string;
  name: string;
  tag: string;
  icon: Icon | null;
  /** Claude Code speaks the Anthropic Messages API; the rest use an OpenAI-compatible provider. */
  api: "anthropic" | "openai";
}

const AGENTS: Agent[] = [
  { id: "claude-code", name: "Claude Code", tag: "CLI", icon: ClaudeCode, api: "anthropic" },
  { id: "opencode", name: "OpenCode", tag: "TUI", icon: OpenCode, api: "openai" },
  { id: "cursor", name: "Cursor", tag: "IDE", icon: Cursor, api: "openai" },
  { id: "cline", name: "Cline", tag: "VS CODE", icon: Cline, api: "openai" },
  { id: "any", name: "Agen lain", tag: "kompatibel OpenAI atau Anthropic", icon: null, api: "openai" },
];

/*
 * TODO(owner): per-agent steps below follow each tool's generic "custom base URL"
 * setting. Confirm exact menu names against the current version of each tool.
 */
function terminalLines(agent: Agent, apiBaseUrl: string, modelId: string): { kind: "comment" | "cmd" | "kv" | "blank"; text: string; k?: string }[] {
  if (agent.api === "anthropic") {
    return [
      { kind: "comment", text: `# arahkan ${agent.name} ke aedoxy` },
      { kind: "cmd", text: `export ANTHROPIC_BASE_URL=${apiBaseUrl}` },
      { kind: "cmd", text: "export ANTHROPIC_AUTH_TOKEN=YOUR_API_KEY" },
      { kind: "cmd", text: "claude" },
    ];
  }
  return [
    { kind: "comment", text: `# pengaturan provider "OpenAI Compatible" di ${agent.name}` },
    { kind: "kv", k: "Base URL", text: `${apiBaseUrl}/v1` },
    { kind: "kv", k: "API key", text: "YOUR_API_KEY" },
    { kind: "kv", k: "Model", text: modelId },
  ];
}

export function IntegrationsSection({ apiBaseUrl, modelId }: { apiBaseUrl: string; modelId: string }) {
  const [activeId, setActiveId] = useState(AGENTS[0].id);
  const active = AGENTS.find((a) => a.id === activeId) ?? AGENTS[0];
  const lines = terminalLines(active, apiBaseUrl, modelId);

  return (
    <section className="section-rule">
      <div className="container-x grid gap-12 py-20 sm:py-28 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-16">
        <div className="reveal">
          <p className="eyebrow">Integrasi</p>
          <h2 className="mt-4 text-[34px] leading-[1.1] font-medium tracking-[-0.035em] text-heading sm:text-[44px]">
            Tetap pakai agen Anda.
            <br />
            <span className="text-fg-muted">Ubah dua baris.</span>
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-fg-muted">
            Agen coding berbasis CLI atau IDE tetap berjalan seperti biasa. Arahkan base URL dan API key ke aedoxy, lalu
            lanjut bekerja.
          </p>
          <ToggleGroup
            type="single"
            spacing={1}
            value={activeId}
            onValueChange={(v) => v && setActiveId(v)}
            aria-label="Agen yang didukung"
            className="mt-8 w-full flex-col items-stretch"
          >
            {AGENTS.map((a) => {
              const Icon = a.icon;
              const on = a.id === activeId;
              return (
                <ToggleGroupItem
                  key={a.id}
                  value={a.id}
                  className="h-auto w-full justify-start gap-3 rounded-xl px-3.5 py-3 text-left font-normal hover:bg-line data-[state=on]:bg-line"
                >
                  <span className="grid size-8 place-items-center rounded-lg border border-line bg-surface text-fg">
                    {Icon ? <Icon size={18} className="size-[18px]" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                  </span>
                  <span className="text-[15px] font-medium text-heading">{a.name}</span>
                  <span className="ml-auto flex items-center gap-2 font-mono text-[10px] tracking-wider text-faint uppercase">
                    {a.tag}
                    {on && <ArrowRight className="size-4 text-fg-muted" aria-hidden />}
                  </span>
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>

        <div className="reveal overflow-hidden rounded-card-lg border border-line bg-surface shadow-card-hover">
          <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
            <span aria-hidden className="size-3 rounded-full bg-[#ff5f57]" />
            <span aria-hidden className="size-3 rounded-full bg-[#febc2e]" />
            <span aria-hidden className="size-3 rounded-full bg-[#28c840]" />
            <span className="mx-auto font-mono text-xs text-faint">~/proyek-saya · {active.api === "anthropic" ? "zsh" : "pengaturan"}</span>
          </div>
          <pre className="min-h-[240px] overflow-x-auto px-6 py-6 font-mono text-[13px] leading-7 text-fg">
            {lines.map((l, i) =>
              l.kind === "comment" ? (
                <code key={i} className="block text-faint">{l.text}</code>
              ) : l.kind === "cmd" ? (
                <code key={i} className="block">
                  <span className="text-primary-ink select-none">$ </span>
                  {l.text}
                </code>
              ) : (
                <code key={i} className="block">
                  <span className="inline-block w-24 text-fg-muted">{l.k}</span>
                  {l.text}
                </code>
              ),
            )}
            <code className="mt-3 block text-fg-muted" aria-hidden>
              <span className="text-primary-ink">&gt; </span>refactor middleware auth <span className="cursor-blink" />
            </code>
          </pre>
          <p className="border-t border-line px-6 py-3.5 font-mono text-[11px] text-faint">
            Pola yang sama untuk agen lain yang kompatibel dengan OpenAI atau Anthropic.
          </p>
        </div>
      </div>
    </section>
  );
}
