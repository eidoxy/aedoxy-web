"use client";

import { ArrowUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { useDocs } from "./docs-provider";
import { SectionHeading } from "./section-heading";

export function TroubleshootingSection() {
  const { t } = useDocs();
  const s = t.troubleshooting;

  return (
    <section id="troubleshooting" className="scroll-mt-28 border-t border-line py-16 pb-4">
      <SectionHeading number={s.number} eyebrow={s.eyebrow} title={s.title} description={s.description} />
      <div className="grid gap-3 sm:grid-cols-2">
        {s.items.map((item) => (
          <Card key={item.code} className="gap-3 py-5">
            <CardHeader className="gap-3 px-5">
              <span className="w-fit rounded-md border border-line-strong px-2 py-0.5 font-mono text-xs text-fg-muted">{item.code}</span>
              <h3 className="text-base leading-snug font-medium text-heading">{item.title}</h3>
              <CardDescription className="leading-relaxed">{item.description}</CardDescription>
              {item.link.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  {item.link.map((l) => (
                    <Link key={l.href} href={l.href} className="inline-flex min-h-6 items-center text-sm font-medium text-primary-ink underline underline-offset-4">
                      {l.label}
                    </Link>
                  ))}
                </div>
              )}
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className="mt-12 flex-col items-start justify-between gap-6 px-6 py-6 sm:flex-row sm:items-center">
        <p className="max-w-md text-lg leading-snug font-medium text-heading">{s.cta.title}</p>
        <Button asChild className="h-10 px-4 text-sm font-semibold">
          <a href="#konfigurasi">
            {s.cta.button} <ArrowUp aria-hidden />
          </a>
        </Button>
      </Card>
    </section>
  );
}
