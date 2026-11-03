/**
 * Bans a user and closes their console account. Run on the server only:
 *   bun scripts/ban-user.ts <email> [reason]      (or: bun run db:ban-user <email> [reason])
 * Sets the ban (no end date), signs the user out everywhere, writes an audit row and disables the console account.
 * The reason is shown to the user on the sign-in page ("Alasan: ..."), so write one that is safe to read; it is cut at 200 characters.
 * There is no HTTP endpoint for this.
 */
import { pool } from "@/server/db/client";
import { banUser } from "@/server/domain/ban-user";

async function main() {
  const [email, ...reason] = process.argv.slice(2);
  if (!email) throw new Error("usage: bun scripts/ban-user.ts <email> [reason]");
  const result = await banUser(email, reason.join(" "));
  if (!result) throw new Error(`no user with email ${email}`);
  console.log(`Banned ${result.email}${result.changed ? "" : " (was already banned)"}. ${result.sessionsRevoked} session(s) revoked.`);
  console.log(
    result.console === "pending"
      ? "console: tertunda, worker akan mengulang"
      : result.console === "protected"
        ? "console: menolak (admin di console, 409); turunkan perannya di console lalu jalankan ulang"
        : result.console === "none"
          ? "console: tidak ada akun console"
          : "console: dinonaktifkan",
  );
}

main()
  .catch((err: unknown) => {
    console.error(`ban-user failed: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
