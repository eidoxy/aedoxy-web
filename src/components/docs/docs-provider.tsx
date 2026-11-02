"use client";

import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { getDict, type DocsDict } from "@/lib/docs/i18n";
import { brandEnvKey, buildDocsSnippets, type DocsLang, type DocsSnippets } from "@/lib/docs/snippets";

type Config = { gatewayUrl: string; apiKey: string; model: string };

type DocsContextValue = {
  language: DocsLang;
  setLanguage: (lang: DocsLang) => void;
  t: DocsDict;
  config: Config;
  setConfig: (patch: Partial<Config>) => void;
  snippets: DocsSnippets;
  brandName: string;
};

const DocsContext = createContext<DocsContextValue | null>(null);

export function useDocs(): DocsContextValue {
  const ctx = useContext(DocsContext);
  if (!ctx) throw new Error("useDocs must be used inside <DocsProvider>");
  return ctx;
}

const STORAGE_KEY = "docs_lang";
const listeners = new Set<() => void>();
let memoryLang: DocsLang | null = null; // used when localStorage is blocked, so the switch still works

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readLanguage(): DocsLang {
  if (memoryLang) return memoryLang;
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "id";
  } catch {
    return "id";
  }
}

function writeLanguage(lang: DocsLang) {
  memoryLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // storage blocked: the in-memory value keeps this visit working
  }
  listeners.forEach((l) => l());
}

/**
 * Holds the docs language and the quick-configuration values. The server renders Indonesian; the saved
 * choice is read through useSyncExternalStore, so the first client render matches the server HTML.
 */
export function DocsProvider({ brandName, apiBaseUrl, sampleModel, children }: { brandName: string; apiBaseUrl: string; sampleModel: string; children: ReactNode }) {
  const language = useSyncExternalStore(subscribe, readLanguage, () => "id" as const);
  const [config, setFullConfig] = useState<Config>({ gatewayUrl: apiBaseUrl, apiKey: "", model: sampleModel });

  const value = useMemo<DocsContextValue>(() => {
    const envKey = brandEnvKey(brandName);
    return {
      language,
      setLanguage: writeLanguage,
      t: getDict(language, { brand: brandName, envKey }),
      config,
      setConfig: (patch) => setFullConfig((c) => ({ ...c, ...patch })),
      snippets: buildDocsSnippets({ brandName, lang: language, ...config, defaults: { gatewayUrl: apiBaseUrl, model: sampleModel } }),
      brandName,
    };
  }, [language, config, brandName, apiBaseUrl, sampleModel]);

  return (
    <DocsContext.Provider value={value}>
      <div lang={language}>{children}</div>
    </DocsContext.Provider>
  );
}
