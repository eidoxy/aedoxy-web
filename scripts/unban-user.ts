/**
 * Lifts a ban and reopens the console account. Run on the server only:
 *   bun scripts/unban-user.ts <email>      (or: bun run db:unban-user <email>)
 * There is no HTTP endpoint for this.
 */
import { pool } from "@/server/db/client";
import { unbanUser } from "@/server/domain/ban-user";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: bun scripts/unban-user.ts <email>");
  const result = await unbanUser(email);
  if (!result) throw new Error(`no user with email ${email}`);
  console.log(`Unbanned ${result.email}${result.changed ? "" : " (was not banned)"}.`);
  console.log(
    result.console === "pending"
      ? "console: tertunda, worker akan mengulang"
      : result.console === "none"
        ? "console: tidak ada akun console"
        : "console: diaktifkan",
  );
}

main()
  .catch((err: unknown) => {
    console.error(`unban-user failed: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
