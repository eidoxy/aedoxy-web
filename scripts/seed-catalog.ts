/**
 * Seeds the example plan catalog and (once) the credit pool row. Idempotent.
 *
 * Run: bun scripts/seed-catalog.ts   (Bun loads .env.local itself)
 * Optional: SEED_POOL_USD=500 sets the opening pool balance when the pool row does not exist yet.
 */
import { pool } from "@/server/db/client";
import { seedCatalog } from "@/server/domain/seed-catalog";

async function main() {
  const raw = process.env.SEED_POOL_USD;
  const poolUsd = raw ? Number(raw) : 0;
  const result = await seedCatalog({ poolUsd });
  console.log(`plans upserted: ${result.plans}; pool row ${result.poolCreated ? `created (opening $${poolUsd})` : "already existed, balance untouched"}.`);
}

main()
  .catch((err: unknown) => {
    console.error(`seed failed: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
