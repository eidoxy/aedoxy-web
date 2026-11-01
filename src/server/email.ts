import { env } from "@/env";

export type EmailMessage = { to: string; subject: string; text: string };

/**
 * Transactional email. No provider is chosen yet (Resend or SMTP, TRD section 11),
 * so without EMAIL_SERVER_URL the message is printed to the server console in
 * development and the call fails in production. Never log this output in production.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
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
