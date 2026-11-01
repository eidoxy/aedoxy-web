"use client";

import { Brain, Check, Copy, FileText, ImageIcon, Search, Type, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DitherPanel } from "@/components/brand/dither-panel";
import { ProviderLogo } from "@/components/brand/provider-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FxFootnote } from "@/components/usd-idr";
import { formatIdr, formatTokens, formatUsd } from "@/lib/format";
import { usdToIdr } from "@/lib/fx";
import { filterModels, savingPercent, sortModels, type ModelSort } from "@/lib/models";
import { cn } from "@/lib/utils";
import type { Capability, FxRate, Model, ModelStatus, Provider } from "@/server/catalog/types";

const CAPABILITY: Record<Capability, { label: string; icon: LucideIcon }> = {
  text: { label: "Teks", icon: Type },
  image: { label: "Gambar", icon: ImageIcon },
  file: { label: "File", icon: FileText },
  reasoning: { label: "Reasoning", icon: Brain },
};

const STATUS: Record<ModelStatus, { label: string; dot: string }> = {
  active: { label: "Aktif", dot: "bg-success" },
  degraded: { label: "Terganggu", dot: "bg-warn" },
  offline: { label: "Offline", dot: "bg-danger" },
};

const SORTS: { value: ModelSort; label: string }[] = [
  { value: "name", label: "Urut: A → Z" },
  { value: "price-asc", label: "Biaya termurah" },
  { value: "price-desc", label: "Biaya termahal" },
  { value: "context", label: "Context terbesar" },
];

type Currency = "usd" | "idr";

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable || target.closest('[role="combobox"], [role="listbox"]') !== null)
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger
        aria-label={label}
        className="h-11 w-full rounded-xl border-line-strong bg-surface py-0 pr-3 pl-4 text-sm text-fg-soft hover:bg-surface dark:bg-surface dark:hover:bg-surface"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="rounded-xl bg-surface shadow-card-hover">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-fg-soft">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ModelsCatalog({ providers, models, fx }: { providers: Provider[]; models: Model[]; fx: FxRate | null }) {
  const [query, setQuery] = useState("");
  const [providerId, setProviderId] = useState("all");
  const [capability, setCapability] = useState<Capability | "all">("all");
  const [status, setStatus] = useState<ModelStatus | "all">("all");
  const [sort, setSort] = useState<ModelSort>("name");
  const [currency, setCurrency] = useState<Currency>("usd");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const idrAvailable = fx !== null && fx.showConversion;
  const showIdr = currency === "idr" && idrAvailable;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !isTyping(e.target)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (copiedId === null) return;
    const id = setTimeout(() => setCopiedId(null), 1500);
    return () => clearTimeout(id);
  }, [copiedId]);

  async function copy(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      setCopiedId(id);
    } catch {
      // Clipboard unavailable; nothing to confirm.
    }
  }

  const groups = useMemo(() => {
    const visible = sortModels(filterModels(models, { query, providerId, capability, status }), sort);
    return providers
      .map((provider) => ({ provider, models: visible.filter((m) => m.providerId === provider.id) }))
      .filter((g) => g.models.length > 0);
  }, [models, providers, query, providerId, capability, status, sort]);

  // Rupiah appears only here, on provider list prices (F04/F08); credit cost stays in $.
  const officialPair = (inUsd: number, outUsd: number) =>
    showIdr && fx
      ? `≈ ${formatIdr(usdToIdr(inUsd, fx))} / ${formatIdr(usdToIdr(outUsd, fx))}`
      : `${formatUsd(inUsd)} / ${formatUsd(outUsd)}`;

  function reset() {
    setQuery("");
    setProviderId("all");
    setCapability("all");
    setStatus("all");
  }

  return (
    <div>
      <div role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))_auto]">
        <label className="relative block sm:col-span-2 lg:col-span-1">
          <span className="sr-only">Cari model</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-fg-muted" aria-hidden />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari model…"
            className="h-11 rounded-xl border-line-strong bg-surface py-0 pr-12 pl-11 text-sm text-fg placeholder:text-faint dark:bg-surface"
          />
          <kbd aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-line-strong px-1.5 font-mono text-[11px] text-faint">
            /
          </kbd>
        </label>
        <FilterSelect
          label="Provider"
          value={providerId}
          onChange={setProviderId}
          options={[{ value: "all", label: "Semua provider" }, ...providers.map((p) => ({ value: p.id, label: p.name }))]}
        />
        <FilterSelect
          label="Kemampuan"
          value={capability}
          onChange={setCapability}
          options={[
            { value: "all", label: "Semua kemampuan" },
            ...(Object.keys(CAPABILITY) as Capability[]).map((c) => ({ value: c, label: CAPABILITY[c].label })),
          ]}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "Semua status" },
            ...(Object.keys(STATUS) as ModelStatus[]).map((s) => ({ value: s, label: STATUS[s].label })),
          ]}
        />
        <FilterSelect label="Urutkan" value={sort} onChange={setSort} options={SORTS} />
        {idrAvailable && (
          <ToggleGroup
            type="single"
            spacing={1}
            value={currency}
            onValueChange={(v) => v && setCurrency(v as Currency)}
            aria-label="Mata uang harga resmi"
            className="h-11 w-full rounded-xl border border-line-strong bg-surface p-1 font-mono text-xs"
          >
            {(["usd", "idr"] as const).map((c) => (
              <ToggleGroupItem
                key={c}
                value={c}
                className="h-full flex-1 rounded-lg px-3.5 text-fg-muted uppercase hover:bg-transparent data-[state=on]:bg-alt data-[state=on]:font-semibold data-[state=on]:text-heading"
              >
                {c}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
      </div>

      <ToggleGroup
        type="single"
        value={providerId === "all" ? "" : providerId}
        onValueChange={(v) => setProviderId(v || "all")}
        aria-label="Filter provider"
        className="mt-4 w-full flex-wrap"
      >
        {providers.map((p) => (
          <ToggleGroupItem
            key={p.id}
            value={p.id}
            className="h-auto gap-2 rounded-full border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-normal text-fg-soft hover:bg-surface hover:text-heading data-[state=on]:border-primary-ink/40 data-[state=on]:bg-primary-tint data-[state=on]:text-primary-ink data-[state=on]:hover:bg-primary-tint data-[state=on]:hover:text-primary-ink"
          >
            <ProviderLogo id={p.id} name={p.name} size={14} className="size-3.5" />
            {p.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="mt-10 space-y-8" aria-live="polite">
        {groups.length === 0 && (
          <div className="rounded-card-lg border border-line bg-surface p-10 text-center">
            <p className="text-heading">Tidak ada model yang cocok.</p>
            <Button type="button" variant="link" onClick={reset} className="mt-3 h-auto p-0 font-semibold text-primary-ink">
              Reset filter
            </Button>
          </div>
        )}
        {groups.map(({ provider, models: rows }, gi) => {
          const from = Math.min(...rows.map((m) => m.creditInputUsdPerM));
          return (
            <section
              key={provider.id}
              aria-labelledby={`provider-${provider.id}`}
              className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-card-lg border border-line bg-surface shadow-card md:grid-cols-[300px_minmax(0,1fr)]"
            >
              <DitherPanel seed={gi + 1} className="min-h-[150px] md:min-h-full">
                <div className="relative flex h-full flex-col justify-between p-5">
                  <span className="grid size-11 place-items-center rounded-xl bg-surface text-fg shadow-card">
                    <ProviderLogo id={provider.id} name={provider.name} size={24} />
                  </span>
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-surface via-surface/85 to-transparent" />
                  <div className="relative mt-8">
                    <h2 id={`provider-${provider.id}`} className="text-[28px] font-medium tracking-[-0.03em] text-heading">
                      {provider.name}
                    </h2>
                    <p className="mt-1 font-mono text-[11px] tracking-wider text-fg-muted uppercase">
                      {rows.length} model · mulai {formatUsd(from)} / 1M
                    </p>
                  </div>
                </div>
              </DitherPanel>

              <div className="relative min-w-0 overflow-x-auto">
                <Table className="min-w-[860px] text-left">
                  <TableCaption className="sr-only">Model {provider.name}</TableCaption>
                  <TableHeader>
                    <TableRow className="border-line hover:bg-transparent">
                      <TableHead className="mono-label h-auto px-4 py-4 font-normal whitespace-normal text-faint">Model</TableHead>
                      <TableHead className="mono-label h-auto px-4 py-4 font-normal whitespace-normal text-faint">Context</TableHead>
                      <TableHead className="mono-label h-auto px-4 py-4 font-normal whitespace-normal text-faint">Kemampuan</TableHead>
                      <TableHead className="mono-label h-auto px-4 py-4 font-normal whitespace-normal text-faint">Status</TableHead>
                      <TableHead className="mono-label h-auto px-4 py-4 font-normal whitespace-normal text-faint text-right">Resmi · in / out</TableHead>
                      <TableHead className="mono-label h-auto px-4 py-4 font-normal whitespace-normal text-faint text-right">Biaya kredit / 1M</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((m) => {
                      const saving = savingPercent(m);
                      const st = STATUS[m.status];
                      return (
                        <TableRow key={m.id} className="border-line hover:bg-transparent">
                          <TableCell className="px-4 py-3.5 whitespace-normal">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-sm text-heading">{m.id}</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => copy(m.id)}
                                    aria-label={`Salin nama model ${m.id}`}
                                    className="rounded text-faint hover:bg-transparent hover:text-heading dark:hover:bg-transparent"
                                  >
                                    {copiedId === m.id ? <Check className="size-3.5 text-primary-ink" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>{copiedId === m.id ? "Disalin" : "Salin nama model"}</TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3.5 font-mono text-xs leading-5 whitespace-nowrap">
                            {m.contextIn === null ? (
                              <span className="text-faint">–</span>
                            ) : (
                              <>
                                <span className="font-semibold text-heading">{formatTokens(m.contextIn)}</span> <span className="text-primary-ink">in</span>
                                {m.contextOut !== null && <span className="block text-faint">{formatTokens(m.contextOut)} out</span>}
                              </>
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3.5 whitespace-normal">
                            <ul className="flex gap-1.5">
                              {m.capabilities.map((c) => {
                                const { label, icon: Icon } = CAPABILITY[c];
                                return (
                                  <li key={c} title={label} className="grid size-7 place-items-center rounded-md bg-alt text-fg-muted">
                                    <Icon className="size-3.5" aria-hidden />
                                    <span className="sr-only">{label}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </TableCell>
                          <TableCell className="px-4 py-3.5 whitespace-normal">
                            <span className="inline-flex items-center gap-2 text-sm text-fg-soft">
                              <span className={cn("size-2 rounded-full", st.dot)} aria-hidden />
                              {st.label}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3.5 text-right font-mono text-xs leading-5 whitespace-nowrap">
                            {m.officialInputUsdPerM !== null && m.officialOutputUsdPerM !== null ? (
                              <>
                                <s className="text-faint">
                                  <span className="sr-only">Harga resmi </span>
                                  {officialPair(m.officialInputUsdPerM, m.officialOutputUsdPerM)}
                                </s>
                                {saving !== null && <span className="block text-primary-ink">hemat {saving}%</span>}
                              </>
                            ) : (
                              <span className="text-faint">–</span>
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3.5 text-right font-mono text-xs leading-5 whitespace-nowrap">
                            <span className="text-sm font-semibold text-heading">{formatUsd(m.creditInputUsdPerM)}</span> <span className="text-faint">in</span>
                            <span className="block text-fg-soft">
                              {formatUsd(m.creditOutputUsdPerM)} <span className="text-faint">out</span>
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          );
        })}
      </div>

      {showIdr && <FxFootnote fx={fx} className="mt-6" />}
    </div>
  );
}
