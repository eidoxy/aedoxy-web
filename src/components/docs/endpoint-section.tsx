"use client";

import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { CopyButton } from "./copy-button";
import { useDocs } from "./docs-provider";
import { FormattedText } from "./formatted-text";
import { SectionHeading } from "./section-heading";

function UrlRow({ url }: { url: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-surface-2 py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg">{url}</code>
      <CopyButton value={url} className="shrink-0" />
    </div>
  );
}

export function EndpointSection() {
  const { t, snippets } = useDocs();
  const e = t.endpoint;
  const cards = [
    { badge: e.openaiBadge, eyebrow: e.openaiEyebrow, title: e.openaiTitle, description: e.openaiDescription, url: snippets.openaiUrl, paths: ["POST /v1/chat/completions", "POST /v1/responses", "GET /v1/models"] },
    { badge: e.anthropicBadge, eyebrow: e.anthropicEyebrow, title: e.anthropicTitle, description: e.anthropicDescription, url: snippets.anthropicUrl, paths: ["POST /v1/messages", "ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"] },
  ];

  return (
    <section id="endpoint" className="scroll-mt-28 border-t border-line py-16">
      <SectionHeading number={e.number} eyebrow={e.eyebrow} title={e.title} description={e.description} />
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <Card key={c.eyebrow} className="gap-5 py-6">
            <CardHeader className="px-6">
              <div className="flex items-center justify-between gap-3">
                <p className="eyebrow">{c.eyebrow}</p>
                <Badge variant="outline" className="border-line-strong font-mono text-[11px] text-fg-muted">
                  {c.badge}
                </Badge>
              </div>
              <h3 className="mt-3 text-xl font-medium tracking-tight text-heading">{c.title}</h3>
              <CardDescription>{c.description}</CardDescription>
            </CardHeader>
            <CardContent className="px-6">
              <UrlRow url={c.url} />
              <ul className="mt-5 grid gap-2 font-mono text-xs text-fg-muted">
                {c.paths.map((p) => (
                  <li key={p} className="truncate">
                    {p}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <Alert variant="warning" className="mt-5">
        <TriangleAlert aria-hidden />
        <AlertTitle>{e.warningTitle}</AlertTitle>
        <AlertDescription>
          <FormattedText text={e.warningDescription} />
        </AlertDescription>
      </Alert>
    </section>
  );
}
