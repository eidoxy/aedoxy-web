/**
 * Emergency 2FA reset for a user who lost the authenticator AND the backup codes. Run on the server only:
 *   bun scripts/reset-2fa.ts <email>      (or: bun run db:reset-2fa <email>)
 * Removes the 2FA secret, signs the user out everywhere and writes an audit row. There is no HTTP endpoint for this.
 */
import { pool } from "@/server/db/client";
import { reset2fa } from "@/server/domain/reset-2fa";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: bun scripts/reset-2fa.ts <email>");
  const result = await reset2fa(email);
  if (!result) throw new Error(`no user with email ${email}`);
  console.log(`2FA reset for ${result.email}. ${result.sessionsRevoked} session(s) revoked.`);
  console.log("Next: sign in with the password. An admin is redirected to /admin/security to enrol 2FA again.");
}

main()
  .catch((err: unknown) => {
    console.error(`reset-2fa failed: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
