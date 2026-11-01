/**
 * Seeds the example plan catalog and (once) the credit pool row. Idempotent.
 *
 * Run: bun scripts/seed-catalog.ts   (Bun loads .env.local itself)
 * Optional: SEED_POOL_USD=500 sets the opening pool balance when the pool row does not exist yet.
 */
import { pool } from "@/server/db/client";
import { seedCatalog, syncUnsyncedPlans } from "@/server/domain/seed-catalog";

async function main() {
  const raw = process.env.SEED_POOL_USD;
  const poolUsd = raw ? Number(raw) : 0;
  const result = await seedCatalog({ poolUsd });
  console.log(`plans upserted: ${result.plans}.`);
  if (result.poolCreated) console.log(`pool row created (opening $${poolUsd}).`);
  else console.log("pool row already exists: balance NOT changed (SEED_POOL_USD ignored). To top up, use admin adjust.");

  // Sync failures must not fail the seed: the data above is already saved.
  const sync = await syncUnsyncedPlans();
  const detail = sync.failed.map((f) => `${f.slug}: ${f.reason}`).join("; ");
  console.log(`plans synced: ${sync.synced}; failed: ${sync.failed.length}${detail ? ` (${detail})` : ""}`);
  if (sync.failed.length > 0) console.log("Check the console and NEWAPI_INTERNAL_URL / NEWAPI_BRIDGE_TOKEN, then rerun this script; synced plans are skipped.");
}

main()
  .catch((err: unknown) => {
    console.error(`seed failed: ${err instanceof Error ? err.message : "unknown error"}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
