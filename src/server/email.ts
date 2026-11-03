import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/env";

export type EmailMessage = { to: string; subject: string; text: string };

/**
 * Transactional email. Order: EMAIL_DEV_OUTBOX (dev/test file sink, refused by env.ts when ENV_STRICT=true),
 * then SMTP from the EMAIL_SMTP_* fields (when EMAIL_SMTP_HOST is set) or EMAIL_SERVER_URL (nodemailer URL; EMAIL_FROM is required),
 * then, without either, a console line in development and a thrown error in production.
 * Never log message content, recipients, hosts or credentials: messages carry token links.
 */
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 };

function transportOptions() {
  if (env.EMAIL_SMTP_HOST) {
    const tls = env.EMAIL_SMTP_TLS ?? "starttls";
    return {
      host: env.EMAIL_SMTP_HOST,
      port: env.EMAIL_SMTP_PORT ?? (tls === "ssl" ? 465 : 587),
      secure: tls === "ssl",
      requireTLS: tls === "starttls",
      ...(env.EMAIL_SMTP_USER && env.EMAIL_SMTP_PASSWORD ? { auth: { user: env.EMAIL_SMTP_USER, pass: env.EMAIL_SMTP_PASSWORD } } : {}),
      ...TIMEOUTS,
    };
  }
  return env.EMAIL_SERVER_URL ? { url: env.EMAIL_SERVER_URL, ...TIMEOUTS } : undefined;
}

let cached: { key: string; transport: Transporter } | undefined;

function smtpTransport(options: NonNullable<ReturnType<typeof transportOptions>>) {
  const key = JSON.stringify(options);
  if (cached?.key !== key) cached = { key, transport: nodemailer.createTransport(options) };
  return cached.transport;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.EMAIL_DEV_OUTBOX) {
    await mkdir(dirname(env.EMAIL_DEV_OUTBOX), { recursive: true });
    await appendFile(env.EMAIL_DEV_OUTBOX, `${JSON.stringify({ ts: new Date().toISOString(), ...message })}\n`);
    return;
  }
  const options = transportOptions();
  if (!options) {
    if (env.NODE_ENV === "production") {
      throw new Error("Email is not configured: set EMAIL_SMTP_HOST (with EMAIL_SMTP_PORT/USER/PASSWORD/TLS) or EMAIL_SERVER_URL");
    }
    console.info(`[email:dev] to=${message.to} subject=${message.subject}\n${message.text}\n`);
    return;
  }
  if (!env.EMAIL_FROM) throw new Error("Email is not configured: set EMAIL_FROM");
  try {
    await smtpTransport(options).sendMail({ from: env.EMAIL_FROM, ...message });
  } catch (err) {
    // nodemailer messages can quote the recipient or host; callers log err.message, so keep only the codes.
    const { code, responseCode } = (err as { code?: unknown; responseCode?: unknown } | null) ?? {};
    const parts = [typeof code === "string" ? code : "unknown", ...(typeof responseCode === "number" ? [responseCode] : [])];
    throw new Error(`SMTP send failed (${parts.join(" ")})`);
  }
}
