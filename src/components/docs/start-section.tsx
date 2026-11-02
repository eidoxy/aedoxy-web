"use client";

import { ArrowUpRight, Code2, Eye, EyeOff, KeyRound, Link2 } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDocs } from "./docs-provider";
import { FormattedText } from "./formatted-text";
import { SectionHeading } from "./section-heading";

function Field({ id, label, hint, icon, children }: { id: string; label: string; hint: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint [&>svg]:size-4" aria-hidden>
          {icon}
        </span>
        {children}
      </div>
      <p id={`${id}-hint`} className="text-xs leading-relaxed text-faint">
        {hint}
      </p>
    </div>
  );
}

const inputClass = "h-10 pl-10 font-mono text-[13px]";

/** Section 01: prerequisites and the form that rewrites every sample on the page. */
export function StartSection() {
  const { t, config, setConfig } = useDocs();
  const [showKey, setShowKey] = useState(false);

  return (
    <section id="mulai" className="scroll-mt-28 pb-16">
      <SectionHeading number={t.start.number} eyebrow={t.start.eyebrow} title={t.start.title} description={t.start.description} />

      <h3 className="mb-4 text-lg font-medium text-heading">{t.start.beforeTitle}</h3>
      <ol className="mb-12 grid gap-3">
        {t.start.before.map((step, i) => (
          <li key={step.href} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] border border-line bg-surface p-4 shadow-card">
            <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line-strong font-mono text-xs text-heading">{i + 1}</span>
            <p className="min-w-0 flex-1 basis-60 text-sm leading-relaxed text-fg-muted">
              <FormattedText text={step.text} />
            </p>
            <Button asChild variant="outline" className="h-9 bg-surface px-3 text-[13px] font-semibold">
              <Link href={step.href}>
                {step.cta} <ArrowUpRight aria-hidden />
              </Link>
            </Button>
          </li>
        ))}
      </ol>

      <Card id="konfigurasi" className="scroll-mt-28 gap-5 py-6">
        <CardHeader className="px-6">
          <h3 className="text-lg font-medium text-heading">{t.config.title}</h3>
          <p className="max-w-2xl text-sm leading-relaxed text-fg-muted">{t.config.description}</p>
        </CardHeader>
        <CardContent className="grid gap-5 px-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field id="docs-gateway" label={t.config.gatewayLabel} hint={t.config.gatewayHint} icon={<Link2 />}>
              <Input
                id="docs-gateway"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                aria-describedby="docs-gateway-hint"
                className={inputClass}
                value={config.gatewayUrl}
                onChange={(e) => setConfig({ gatewayUrl: e.target.value })}
              />
            </Field>
          </div>
          <Field id="docs-key" label={t.config.apiKeyLabel} hint={t.config.apiKeyHint} icon={<KeyRound />}>
            <Input
              id="docs-key"
              type={showKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              placeholder="YOUR_API_KEY"
              aria-describedby="docs-key-hint"
              className={`${inputClass} pr-11`}
              value={config.apiKey}
              onChange={(e) => setConfig({ apiKey: e.target.value })}
            />
            <Button
              type="button"
              variant="ghost"
              className="absolute top-1/2 right-1 size-8 -translate-y-1/2 text-fg-muted"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? t.common.hideKey : t.common.showKey}
              aria-pressed={showKey}
            >
              {showKey ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </Button>
          </Field>
          <Field id="docs-model" label={t.config.modelLabel} hint={t.config.modelHint} icon={<Code2 />}>
            <Input
              id="docs-model"
              autoComplete="off"
              spellCheck={false}
              aria-describedby="docs-model-hint"
              className={inputClass}
              value={config.model}
              onChange={(e) => setConfig({ model: e.target.value })}
            />
          </Field>
        </CardContent>
      </Card>
    </section>
  );
}
