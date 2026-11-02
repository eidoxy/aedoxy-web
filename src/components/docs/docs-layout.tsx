"use client";

import { useEffect, useState, type ReactNode } from "react";
import { pickActiveSection, SECTION_IDS, TOOLS, type SectionId } from "@/lib/docs/sections";
import { cn } from "@/lib/utils";
import { useDocs } from "./docs-provider";
import { LanguageSwitcher } from "./language-switcher";

/** A section counts as current once its top edge is above this many px (clears the sticky header and pill bar). */
const SPY_OFFSET = 150;

function useActiveSection(): SectionId {
  const [active, setActive] = useState<SectionId>(SECTION_IDS[0]);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom) return setActive(SECTION_IDS[SECTION_IDS.length - 1]);
      const tops = SECTION_IDS.flatMap((id) => {
        const el = document.getElementById(id);
        return el ? [{ id, top: el.getBoundingClientRect().top }] : [];
      });
      const next = pickActiveSection(tops, SPY_OFFSET);
      if (next) setActive(next);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return active;
}

/** Rail (lg+) or scrollable pill bar (below lg) around the docs sections, with a scrollspy marking the current one. */
export function DocsLayout({ children }: { children: ReactNode }) {
  const { t } = useDocs();
  const active = useActiveSection();

  return (
    <div className="container-x">
      <nav
        aria-label={t.nav.mobile}
        className="sticky top-16 z-30 -mx-5 flex items-center gap-2 overflow-x-auto border-b border-line bg-bg/90 px-5 py-2.5 backdrop-blur-md sm:-mx-10 sm:px-10 md:top-20 lg:hidden"
      >
        {t.nav.main.map(({ id, label }) => (
          <a
            key={id}
            href={`#${id}`}
            aria-current={active === id ? "location" : undefined}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-full border border-line-strong px-3.5 text-[13px] font-medium whitespace-nowrap text-fg-muted transition-colors hover:text-heading",
              active === id && "border-heading bg-heading text-bg hover:text-bg",
            )}
          >
            {label}
          </a>
        ))}
        <div className="ml-auto shrink-0 pl-2">
          <LanguageSwitcher />
        </div>
      </nav>

      <div className="grid gap-x-14 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-28 flex max-h-[calc(100vh-8rem)] flex-col gap-8 overflow-y-auto py-10 pr-2">
            <nav aria-label={t.nav.rail} className="grid gap-1">
              {t.nav.main.map(({ id, number, label }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  aria-current={active === id ? "location" : undefined}
                  className={cn(
                    "flex min-h-9 items-center gap-3 rounded-lg px-3 text-sm font-medium text-fg-muted transition-colors hover:bg-line hover:text-heading",
                    active === id && "bg-line text-heading",
                  )}
                >
                  <span className="font-mono text-xs text-faint">{number}</span>
                  {label}
                </a>
              ))}
            </nav>
            <div>
              <p className="mono-label mb-2 px-3">{t.nav.toolsHeading}</p>
              <ul className="grid gap-0.5">
                {TOOLS.map((tool) => (
                  <li key={tool.id}>
                    <a href={`#${tool.id}`} className="flex min-h-8 items-center rounded-lg px-3 text-sm text-fg-muted transition-colors hover:bg-line hover:text-heading">
                      {tool.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <LanguageSwitcher />
          </div>
        </aside>
        <div className="min-w-0 py-10">{children}</div>
      </div>
    </div>
  );
}
