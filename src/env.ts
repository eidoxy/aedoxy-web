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
  GOOGLE_CLIENT_ID: later(z.string().min(1)),
  GOOGLE_CLIENT_SECRET: later(z.string().min(1)),

  // First-party OIDC client for the New API console (seeded by scripts/seed-oauth-client.ts)
  CONSOLE_OIDC_CLIENT_ID: z.string().min(1).default("aedoxy-console"),
  CONSOLE_OIDC_CLIENT_SECRET: later(z.string().min(1)),

  // Transactional email (provider not chosen yet: Resend or SMTP)
  EMAIL_FROM: later(z.string().min(1)),
  EMAIL_SERVER_URL: later(z.string().min(1)),
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
