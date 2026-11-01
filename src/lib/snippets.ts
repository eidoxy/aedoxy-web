export type SnippetLang = "python" | "node" | "curl";

export const SNIPPET_LANGS: SnippetLang[] = ["python", "node", "curl"];

const KEY = "YOUR_API_KEY";

/** Hero code samples. `apiBaseUrl` has no trailing slash and no /v1. */
export function buildSnippet(lang: SnippetLang, apiBaseUrl: string, model: string): string {
  switch (lang) {
    case "python":
      return `from openai import OpenAI

client = OpenAI(
  base_url="${apiBaseUrl}/v1",
  api_key="${KEY}",
)

# ganti model kapan saja, kode tetap sama
res = client.chat.completions.create(
  model="${model}",
  messages=[{"role": "user", "content": "Halo!"}],
  stream=True,
)`;
    case "node":
      return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${apiBaseUrl}/v1",
  apiKey: "${KEY}",
});

// ganti model kapan saja, kode tetap sama
const res = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "Halo!" }],
  stream: true,
});`;
    case "curl":
      return `curl ${apiBaseUrl}/v1/chat/completions \\
  -H "Authorization: Bearer ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [{"role": "user", "content": "Halo!"}],
    "stream": true
  }'`;
  }
}
