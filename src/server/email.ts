import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/env";

export type EmailMessage = { to: string; subject: string; text: string };

/**
 * Transactional email. Order: EMAIL_DEV_OUTBOX (dev/test file sink, refused by env.ts when ENV_STRICT=true),
 * then SMTP when EMAIL_SERVER_URL is set (a nodemailer URL such as smtp://USER:PASS@host:587; EMAIL_FROM is required),
 * then, without a URL, a console line in development and a thrown error in production.
 * Never log message content, recipients or the SMTP URL: messages carry token links.
 */
let cached: { url: string; transport: Transporter } | undefined;

function smtpTransport(url: string) {
  if (cached?.url !== url) {
    cached = {
      url,
      transport: nodemailer.createTransport({ url, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 }),
    };
  }
  return cached.transport;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.EMAIL_DEV_OUTBOX) {
    await mkdir(dirname(env.EMAIL_DEV_OUTBOX), { recursive: true });
    await appendFile(env.EMAIL_DEV_OUTBOX, `${JSON.stringify({ ts: new Date().toISOString(), ...message })}\n`);
    return;
  }
  if (!env.EMAIL_SERVER_URL) {
    if (env.NODE_ENV === "production") {
      throw new Error("Email is not configured: set EMAIL_SERVER_URL");
    }
    console.info(`[email:dev] to=${message.to} subject=${message.subject}\n${message.text}\n`);
    return;
  }
  if (!env.EMAIL_FROM) throw new Error("Email is not configured: set EMAIL_FROM");
  try {
    await smtpTransport(env.EMAIL_SERVER_URL).sendMail({ from: env.EMAIL_FROM, ...message });
  } catch (err) {
    // nodemailer messages can quote the recipient; callers log err.message, so keep only the error code.
    const code = (err as { code?: unknown } | null)?.code;
    throw new Error(`SMTP send failed (${typeof code === "string" ? code : "unknown"})`);
  }
}
