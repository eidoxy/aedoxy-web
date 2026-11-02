export type DocsLang = "id" | "en";

export const DEFAULT_API_KEY = "YOUR_API_KEY";

export type DocsSnippets = {
  /** Gateway URL without trailing slash and without /v1: what Anthropic clients expect. */
  anthropicUrl: string;
  /** Same URL plus /v1: what OpenAI-compatible clients expect. */
  openaiUrl: string;
  apiKey: string;
  model: string;
  /** Provider id (lower case) and environment variable name derived from the brand. */
  providerId: string;
  envKey: string;
  codes: {
    hero: string;
    claudeWindows: string;
    claudeUnix: string;
    claudeJson: string;
    codexConfig: string;
    codexRun: string;
    opencode: string;
    curl: string;
    javascript: string;
    python: string;
    anthropic: string;
  };
};

/** "Obers AI!" -> "obers-ai". Diacritics are folded; a name with no usable characters falls back to "api". */
export function brandSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "api";
}

/** "Obers AI!" -> "OBERS_AI_API_KEY". A leading digit gets a prefix because shells reject such names. */
export function brandEnvKey(name: string): string {
  const base = brandSlug(name).toUpperCase().replace(/-/g, "_");
  return `${/^\d/.test(base) ? "AI_" : ""}${base}_API_KEY`;
}

const trimUrl = (value: string) => value.trim().replace(/\/+$/, "");

export type SnippetInput = {
  brandName: string;
  lang: DocsLang;
  /** What the visitor typed. Empty values fall back to `defaults`. */
  gatewayUrl: string;
  apiKey: string;
  model: string;
  defaults: { gatewayUrl: string; model: string };
};

export function buildDocsSnippets({ brandName, lang, gatewayUrl, apiKey, model, defaults }: SnippetInput): DocsSnippets {
  const anthropicUrl = trimUrl(gatewayUrl) || trimUrl(defaults.gatewayUrl);
  const openaiUrl = `${anthropicUrl}/v1`;
  const key = apiKey.trim() || DEFAULT_API_KEY;
  const mdl = model.trim() || defaults.model;
  const providerId = brandSlug(brandName);
  const envKey = brandEnvKey(brandName);
  const hello = lang === "en" ? "Hello!" : "Halo!";
  const q = JSON.stringify; // a typed value with quotes must not break the JSON/TOML/JS/Python strings below
  const body = (extra: object = {}) => JSON.stringify({ model: mdl, ...extra, messages: [{ role: "user", content: hello }] });

  const curl = `curl ${openaiUrl}/chat/completions \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '${body()}'`;

  return {
    anthropicUrl,
    openaiUrl,
    apiKey: key,
    model: mdl,
    providerId,
    envKey,
    codes: {
      hero: curl,
      claudeWindows: `$env:ANTHROPIC_BASE_URL=${q(anthropicUrl)}
$env:ANTHROPIC_AUTH_TOKEN=${q(key)}
$env:ANTHROPIC_MODEL=${q(mdl)}
claude`,
      claudeUnix: `export ANTHROPIC_BASE_URL=${q(anthropicUrl)}
export ANTHROPIC_AUTH_TOKEN=${q(key)}
export ANTHROPIC_MODEL=${q(mdl)}
claude`,
      claudeJson: `{
  "env": {
    "ANTHROPIC_BASE_URL": ${q(anthropicUrl)},
    "ANTHROPIC_AUTH_TOKEN": ${q(key)},
    "ANTHROPIC_MODEL": ${q(mdl)}
  }
}`,
      codexConfig: `model = ${q(mdl)}
model_provider = ${q(providerId)}

[model_providers.${q(providerId)}]
name = ${q(brandName)}
base_url = ${q(openaiUrl)}
env_key = ${q(envKey)}
wire_api = "responses"`,
      codexRun: `$env:${envKey}=${q(key)}
codex`,
      opencode: `{
  "$schema": "https://opencode.ai/config.json",
  "model": ${q(`${providerId}/${mdl}`)},
  "providers": {
    ${q(providerId)}: {
      "name": ${q(brandName)},
      "env": [${q(envKey)}],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": ${q(openaiUrl)} },
      "models": { ${q(mdl)}: { "name": ${q(mdl)} } }
    }
  }
}`,
      curl,
      javascript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: ${q(key)},
  baseURL: ${q(openaiUrl)},
});

const response = await client.chat.completions.create({
  model: ${q(mdl)},
  messages: [{ role: "user", content: ${q(hello)} }],
});

console.log(response.choices[0].message.content);`,
      python: `from openai import OpenAI

client = OpenAI(
    api_key=${q(key)},
    base_url=${q(openaiUrl)},
)

response = client.chat.completions.create(
    model=${q(mdl)},
    messages=[{"role": "user", "content": ${q(hello)}}],
)

print(response.choices[0].message.content)`,
      anthropic: `curl ${anthropicUrl}/v1/messages \\
  -H "Authorization: Bearer ${key}" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '${body({ max_tokens: 1024 })}'`,
    },
  };
}
