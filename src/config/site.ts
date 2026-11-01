import { env } from "@/env";

export const site = {
  name: "aedoxy",
  tagline: "Satu API key untuk semua model AI",
  description:
    "Langganan kredit API berharga flat dalam rupiah. Satu base URL untuk Claude, GPT, Gemini, DeepSeek, dan model lain. Bayar dengan QRIS atau Virtual Account.",
  url: env.NEXT_PUBLIC_SITE_URL,
  /** Base URL of the New API gateway (OpenAI-compatible, adds /v1). */
  apiBaseUrl: env.NEWAPI_PUBLIC_URL,
  nav: [
    { href: "/models", label: "Models" },
    { href: "/pricing", label: "Pricing" },
    { href: "/docs", label: "Docs" },
  ],
  /** Stub targets until the auth/panel waves land. */
  links: {
    register: "/register",
    login: "/login",
    docs: "/docs",
  },
  legal: [
    { href: "/terms", label: "Syarat Layanan" },
    { href: "/privacy", label: "Kebijakan Privasi" },
    { href: "/refund", label: "Refund" },
  ],
} as const;
