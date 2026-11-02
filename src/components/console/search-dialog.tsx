"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import type { NavGroup } from "@/navigation/nav";

type Hit = { key: string; heading: string; title: string; url: string; icon: NavGroup["items"][number]["icon"] };

/** Searchable pages: every link in the role's own menu (action items such as "Console API" are not pages). */
function hits(groups: readonly NavGroup[]): Hit[] {
  return groups.flatMap((g) =>
    g.items.flatMap((item) => {
      const heading = g.label ?? "Menu";
      if (item.subItems) return item.subItems.map((s) => ({ key: s.url, heading, title: `${item.title}: ${s.title}`, url: s.url, icon: item.icon }));
      return item.url ? [{ key: item.url, heading, title: item.title, url: item.url, icon: item.icon }] : [];
    }),
  );
}

export function SearchDialog({ groups }: { groups: readonly NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const all = hits(groups);
  const headings = [...new Set(all.map((h) => h.heading))];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="h-9 gap-2 bg-surface px-3 font-normal text-fg-muted">
        <Search aria-hidden />
        <span className="hidden sm:inline">Cari</span>
        <span className="sr-only sm:hidden">Cari halaman</span>
        <kbd className="hidden h-5 items-center rounded border border-line bg-bg-alt px-1.5 font-mono text-[10px] text-fg-muted select-none sm:inline-flex">Ctrl K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Cari halaman" description="Ketik nama halaman lalu tekan Enter.">
        <Command>
          <CommandInput placeholder="Cari halaman..." />
          <CommandList>
            <CommandEmpty>Tidak ada hasil.</CommandEmpty>
            {headings.map((heading) => (
              <CommandGroup key={heading} heading={heading}>
                {all
                  .filter((h) => h.heading === heading)
                  .map((h) => (
                    <CommandItem
                      key={h.key}
                      value={`${h.heading} ${h.title}`}
                      onSelect={() => {
                        setOpen(false);
                        router.push(h.url);
                      }}
                    >
                      {h.icon && <h.icon aria-hidden />}
                      <span>{h.title}</span>
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
