import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DICTIONARIES, fillDict, getDict } from "./i18n";
import { pickActiveSection } from "./sections";
import { brandEnvKey, brandSlug, buildDocsSnippets, type SnippetInput } from "./snippets";

const base: SnippetInput = {
  brandName: "Aedoxy",
  lang: "id",
  gatewayUrl: "",
  apiKey: "",
  model: "",
  defaults: { gatewayUrl: "https://ai.example.com", model: "your-model-id" },
};
const build = (over: Partial<SnippetInput> = {}) => buildDocsSnippets({ ...base, ...over });

describe("buildDocsSnippets", () => {
  it("falls back to the defaults for empty values", () => {
    const s = build({ gatewayUrl: "   ", apiKey: " ", model: "" });
    expect(s.anthropicUrl).toBe("https://ai.example.com");
    expect(s.apiKey).toBe("YOUR_API_KEY");
    expect(s.model).toBe("your-model-id");
  });

  it("trims the URL and adds /v1 only for OpenAI-style clients", () => {
    const s = build({ gatewayUrl: "  https://gw.test///  " });
    expect(s.anthropicUrl).toBe("https://gw.test");
    expect(s.openaiUrl).toBe("https://gw.test/v1");
    expect(s.codes.curl).toContain("https://gw.test/v1/chat/completions");
    expect(s.codes.codexConfig).toContain('base_url = "https://gw.test/v1"');
    expect(s.codes.opencode).toContain('"baseURL": "https://gw.test/v1"');
    expect(s.codes.anthropic).toContain("curl https://gw.test/v1/messages");
    expect(s.codes.claudeUnix).toContain('ANTHROPIC_BASE_URL="https://gw.test"');
    expect(s.codes.claudeJson).toContain('"ANTHROPIC_BASE_URL": "https://gw.test"');
  });

  it("derives provider id and env var from the brand", () => {
    const s = build({ brandName: "Obers AI!", apiKey: "k1", model: "m1" });
    expect(s.providerId).toBe("obers-ai");
    expect(s.envKey).toBe("OBERS_AI_API_KEY");
    expect(s.codes.codexConfig).toContain('model_provider = "obers-ai"');
    expect(s.codes.codexConfig).toContain('env_key = "OBERS_AI_API_KEY"');
    expect(s.codes.codexRun).toContain('$env:OBERS_AI_API_KEY="k1"');
    expect(s.codes.opencode).toContain('"model": "obers-ai/m1"');
  });

  it("keeps JSON snippets valid when a value contains quotes", () => {
    const s = build({ apiKey: 'a"b\\c', model: 'm"1' });
    const json = JSON.parse(s.codes.claudeJson);
    expect(json.env.ANTHROPIC_AUTH_TOKEN).toBe('a"b\\c');
    expect(JSON.parse(s.codes.opencode).providers["aedoxy"].models['m"1'].name).toBe('m"1');
    expect(JSON.parse(/-d '(.*)'$/.exec(s.codes.curl)![1]).model).toBe('m"1');
  });

  it("uses the sample message of the chosen language", () => {
    expect(build({ lang: "id" }).codes.python).toContain("Halo!");
    expect(build({ lang: "en" }).codes.python).toContain("Hello!");
  });
});

describe("brandSlug / brandEnvKey", () => {
  it("normalises names", () => {
    expect(brandSlug("Obers AI!")).toBe("obers-ai");
    expect(brandSlug("  Café  Ñandú ")).toBe("cafe-nandu");
    expect(brandSlug("!!!")).toBe("api");
    expect(brandEnvKey("aedoxy")).toBe("AEDOXY_API_KEY");
    expect(brandEnvKey("9Router")).toBe("AI_9ROUTER_API_KEY");
  });
});

type Shape = string | Shape[] | { [k: string]: Shape };
function shape(v: unknown): Shape {
  if (typeof v === "string") return "s";
  if (Array.isArray(v)) return v.map(shape);
  return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, shape(x)]));
}

describe("i18n", () => {
  it("id and en have identical keys and array lengths", () => {
    expect(shape(DICTIONARIES.en)).toEqual(shape(DICTIONARIES.id));
  });

  it("has no empty strings", () => {
    for (const dict of Object.values(DICTIONARIES)) {
      const walk = (v: unknown, path: string) => {
        if (typeof v === "string") return expect(v.trim(), path).not.toBe("");
        Object.entries(v as object).forEach(([k, x]) => walk(x, `${path}.${k}`));
      };
      walk(dict, "dict");
    }
  });

  it("replaces placeholders with the brand and env var", () => {
    for (const lang of ["id", "en"] as const) {
      const json = JSON.stringify(getDict(lang, { brand: "Acme $& AI", envKey: "ACME_API_KEY" }));
      expect(json).not.toMatch(/\{(brand|envKey)\}/);
      expect(json).toContain("Acme $& AI");
      expect(json).toContain("ACME_API_KEY");
    }
  });

  it("fillDict leaves unknown placeholders and non-strings alone", () => {
    expect(fillDict({ a: ["{x} {brand}", 1] }, { brand: "B", envKey: "E" })).toEqual({ a: ["{x} B", 1] });
  });
});

describe("pickActiveSection", () => {
  const s = [
    { id: "a", top: -400 },
    { id: "b", top: 90 },
    { id: "c", top: 700 },
  ];
  it("picks the last section whose top passed the offset", () => {
    expect(pickActiveSection(s, 120)).toBe("b");
    expect(pickActiveSection(s, 800)).toBe("c");
  });
  it("keeps the first section before any has passed, and handles empty input", () => {
    expect(pickActiveSection([{ id: "a", top: 300 }], 120)).toBe("a");
    expect(pickActiveSection([], 120)).toBeNull();
  });
});

describe("no leftover source branding", () => {
  const word = new RegExp(["ober", "sa"].join(""), "i");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  it("src/components/docs and src/lib/docs never mention it", () => {
    const hits = [join(process.cwd(), "src/components/docs"), join(process.cwd(), "src/lib/docs")]
      .flatMap(files)
      .filter((f) => word.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
