import { isAbsolute } from "node:path";
import { z } from "zod";

/**
 * Environment validation (TRD sections 11 and 12). Server-only: import it from
 * server code, never from a "use client" file.
 *
 * Wave 1 builds without a database or any integration, so the secrets below
 * are optional. Set ENV_STRICT=true (production, once the integrations land)
 * and every `later()` variable becomes required: the app then fails to start
 * when one is empty, which is the guard TRD section 11 asks for.
 */
const strict = process.env.ENV_STRICT === "true";

const later = <T extends z.ZodType>(schema: T) =>
  strict ? schema : schema.optional();

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  ENV_STRICT: z.enum(["true", "false"]).default("false"),

  // Public
  NEXT_PUBLIC_SITE_URL: z.url().default("https://aedoxy.com"),
  NEWAPI_PUBLIC_URL: z.url().default("https://ai.aedoxy.com"),

  // Database (DB "aedoxy", own DB user; TRD D8)
  DATABASE_URL: later(z.string().min(1)),

  // Better Auth + Google OAuth
  BETTER_AUTH_SECRET: later(z.string().min(32)),
  BETTER_AUTH_URL: later(z.url()),
  // Google and GitHub sign-in stay optional in strict mode; each pair is checked in superRefine.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),

  // First-party OIDC client for the New API console (seeded by scripts/seed-oauth-client.ts)
  CONSOLE_OIDC_CLIENT_ID: z.string().min(1).default("aedoxy-console"),
  CONSOLE_OIDC_CLIENT_SECRET: later(z.string().min(1)),

  // Transactional email over SMTP. Either the separate EMAIL_SMTP_* fields (win when HOST is set) or EMAIL_SERVER_URL.
  // ENV_STRICT=true requires one of them (superRefine).
  EMAIL_FROM: later(z.string().min(1)),
  EMAIL_SERVER_URL: z.string().min(1).optional(),
  EMAIL_SMTP_HOST: z.string().min(1).optional(),
  EMAIL_SMTP_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  EMAIL_SMTP_USER: z.string().min(1).optional(),
  EMAIL_SMTP_PASSWORD: z.string().min(1).optional(),
  // starttls: upgrade after connect, TLS required (default port 587). ssl: implicit TLS (465). none: local test servers only.
  EMAIL_SMTP_TLS: z.enum(["starttls", "ssl", "none"]).default("starttls"),
  // Dev/test only: absolute file path that receives one JSON line per email. Refused when ENV_STRICT=true.
  EMAIL_DEV_OUTBOX: z.string().min(1).optional(),

  // Poketo
  POKETO_SECRET_KEY: later(z.string().min(1)),
  POKETO_WEBHOOK_SECRET: later(z.string().min(1)),
  // Overridable so tests can point the client at a fake server.
  POKETO_BASE_URL: z.url().default("https://poketo.id/api/v1"),

  // New API bridge
  NEWAPI_INTERNAL_URL: later(z.url()),
  NEWAPI_BRIDGE_TOKEN: later(z.string().min(1)),

  // Optional alert sink (Telegram/Discord webhook)
  ALERT_WEBHOOK_URL: z.url().optional(),
}).superRefine((v, ctx) => {
  for (const p of ["GOOGLE", "GITHUB"] as const) {
    if (!v[`${p}_CLIENT_ID`] !== !v[`${p}_CLIENT_SECRET`]) {
      ctx.addIssue({ code: "custom", path: [`${p}_CLIENT_ID`], message: `set ${p}_CLIENT_ID and ${p}_CLIENT_SECRET together, or leave both empty` });
    }
  }
  if (!v.EMAIL_SMTP_USER !== !v.EMAIL_SMTP_PASSWORD) {
    ctx.addIssue({ code: "custom", path: ["EMAIL_SMTP_USER"], message: "set EMAIL_SMTP_USER and EMAIL_SMTP_PASSWORD together, or leave both empty" });
  }
  if (v.ENV_STRICT === "true" && !v.EMAIL_SMTP_HOST && !v.EMAIL_SERVER_URL) {
    ctx.addIssue({ code: "custom", path: ["EMAIL_SMTP_HOST"], message: "set EMAIL_SMTP_HOST or EMAIL_SERVER_URL when ENV_STRICT=true" });
  }
  if (v.ENV_STRICT === "true" && v.EMAIL_SMTP_HOST && v.EMAIL_SMTP_TLS === "none") {
    ctx.addIssue({ code: "custom", path: ["EMAIL_SMTP_TLS"], message: "EMAIL_SMTP_TLS=none is for local test servers and is refused when ENV_STRICT=true" });
  }
  if (!v.EMAIL_DEV_OUTBOX) return;
  const message =
    v.ENV_STRICT === "true"
      ? "EMAIL_DEV_OUTBOX is dev-only and must be unset when ENV_STRICT=true"
      : !isAbsolute(v.EMAIL_DEV_OUTBOX)
        ? "EMAIL_DEV_OUTBOX must be an absolute path"
        : undefined;
  if (message) ctx.addIssue({ code: "custom", path: ["EMAIL_DEV_OUTBOX"], message });
});

export type Env = z.infer<typeof schema>;

/** Treat `KEY=` lines (empty strings) as unset so `.env` templates stay valid. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const names = result.error.issues
      .map((i) => (i.code === "custom" ? `${i.path.join(".")} (${i.message})` : i.path.join(".")))
      .join(", ");
    throw new Error(`Invalid environment variables: ${names}`);
  }
  return result.data;
}

export const env = parseEnv(process.env);
