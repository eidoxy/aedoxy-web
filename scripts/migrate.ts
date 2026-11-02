/**
 * Applies the Drizzle migrations in ./drizzle. Used by the production image (drizzle-kit is a devDependency
 * and is not shipped): `node scripts/migrate.js`. Idempotent; exits non-zero on failure.
 */
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@/server/db/client";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  await migrate(db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
  console.log("migrations applied.");
}

main()
  .catch((err: unknown) => {
    console.error(`migrate failed: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
