export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("@/env");
  if (env.NODE_ENV === "production" && !env.EMAIL_DEV_OUTBOX && !env.EMAIL_SERVER_URL) {
    console.warn("[email] EMAIL_SERVER_URL is not configured: verification and reset emails will fail.");
  }
}
