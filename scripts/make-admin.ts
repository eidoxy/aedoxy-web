/**
 * Gives an existing user the admin role. Run on the server only:
 *   bun scripts/make-admin.ts <email>      (or: bun run db:make-admin <email>)
 * The user must already exist (registered and verified). The admin area then
 * forces them to enrol 2FA at /admin/security before anything else opens.
 */
import { pool } from "@/server/db/client";
import { makeAdmin } from "@/server/domain/make-admin";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: bun scripts/make-admin.ts <email>");
  const result = await makeAdmin(email);
  if (!result) throw new Error(`no user with email ${email}`);
  console.log(result.changed ? `${result.email} is now an admin.` : `${result.email} was already an admin.`);
}

main()
  .catch((err: unknown) => {
    console.error(`make-admin failed: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
