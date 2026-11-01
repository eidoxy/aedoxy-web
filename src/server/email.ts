import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { env } from "@/env";

export type EmailMessage = { to: string; subject: string; text: string };

/**
 * Transactional email. No provider is chosen yet (Resend or SMTP, TRD section 11).
 * Order: EMAIL_DEV_OUTBOX (dev/test file sink, refused by env.ts when ENV_STRICT=true),
 * then, without EMAIL_SERVER_URL, a console line in development and a thrown error in production.
 * Never log this output in production.
 */
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
  // shortcut: provider not chosen, so a configured URL has no transport yet; wire it when Resend/SMTP is picked.
  throw new Error("EMAIL_SERVER_URL is set but no email transport is implemented yet");
}
