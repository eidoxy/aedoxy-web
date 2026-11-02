"use client";

import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "./code-block";
import { useDocs } from "./docs-provider";

export function DocsHero() {
  const { t, snippets } = useDocs();
  return (
    <section className="border-b border-line">
      <div className="container-x grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:gap-16">
        <div className="min-w-0">
          <p className="eyebrow">{t.hero.eyebrow}</p>
          <h1 className="mt-4 text-[40px] leading-[1.05] font-medium tracking-[-0.045em] text-heading sm:text-6xl">{t.hero.title}</h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-fg-muted">{t.hero.description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="h-11 px-5 text-sm font-semibold">
              <a href="#konfigurasi">
                {t.hero.setupCta} <ArrowDown aria-hidden />
              </a>
            </Button>
            <Button asChild variant="outline" className="h-11 bg-surface px-5 text-sm font-semibold">
              <a href="#integrasi">
                {t.hero.integrationsCta} <ArrowUpRight aria-hidden />
              </a>
            </Button>
          </div>
        </div>
        <CodeBlock title="quick-start.sh" code={snippets.codes.hero} />
      </div>
    </section>
  );
}
