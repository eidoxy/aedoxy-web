/**
 * Sends one fixed test email through the app's own SMTP configuration, to check .env on the server:
 *   node scripts/send-test-email.js <address>      (or: bun scripts/send-test-email.ts <address>)
 * Prints only "terkirim" or a safe error (SMTP code, no host, credentials or recipient). Exit code 0 or 1.
 */
import { env } from "@/env";
import { sendEmail } from "@/server/email";

async function main() {
  const to = process.argv[2];
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error("usage: send-test-email <address>");
  if (!env.EMAIL_DEV_OUTBOX && !env.EMAIL_SMTP_HOST && !env.EMAIL_SERVER_URL) {
    throw new Error("Email is not configured: set EMAIL_SMTP_HOST or EMAIL_SERVER_URL");
  }
  await sendEmail({ to, subject: "Aedoxy SMTP test", text: "This is a test email from Aedoxy. SMTP is configured correctly." });
  console.log("terkirim");
}

main().catch((err: unknown) => {
  console.error(`send-test-email failed: ${err instanceof Error ? err.message : "unknown error"}`);
  process.exitCode = 1;
});
