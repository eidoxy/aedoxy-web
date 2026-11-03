/**
 * Background worker (TRD 10): `bun run worker`. Safe to run next to other
 * instances; claims go through the database. SIGTERM/SIGINT finish the task in
 * flight, close the connection pool and exit.
 */
import { pool } from "@/server/db/client";
import { processFulfillments } from "@/server/domain/fulfillment";
import { refreshFxIfDue } from "@/server/domain/fx-rate";
import { syncConsoleStatuses } from "@/server/domain/console-status";
import { linkConsoleAccounts } from "@/server/domain/link-console-accounts";
import { retryUnsyncedPlans } from "@/server/domain/plan-sync";
import { checkPoolInvariant } from "@/server/domain/pool-invariant";
import { sweepPendingOrders } from "@/server/domain/order-sweeper";
import { deleteExpiredRateLimits } from "@/server/rate-limit";
import { reconcileExpiredGrants } from "@/server/domain/reconcile";
import { runLoop, type WorkerTask } from "./loop";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

const tasks: WorkerTask[] = [
  {
    name: "fulfillments",
    everyMs: 5 * SECOND,
    run: async (signal) => {
      // Drain what is due; rows that just failed are leased until their backoff ends, so this terminates.
      while (!signal.aborted && (await processFulfillments()).claimed > 0);
    },
  },
  { name: "link-console-accounts", everyMs: 2 * MINUTE, run: () => linkConsoleAccounts() },
  { name: "sync-console-status", everyMs: MINUTE, run: () => syncConsoleStatuses() },
  { name: "order-sweeper", everyMs: 5 * MINUTE, run: () => sweepPendingOrders() },
  { name: "reconcile-grants", everyMs: 15 * MINUTE, run: () => reconcileExpiredGrants() },
  { name: "pool-invariant", everyMs: 60 * MINUTE, run: () => checkPoolInvariant() },
  { name: "plan-sync-retry", everyMs: 60 * MINUTE, run: () => retryUnsyncedPlans() },
  // Checks every 5 minutes whether the newest quote is older than fx_settings.refresh_hours; only then it fetches.
  { name: "fx-refresh", everyMs: 5 * MINUTE, run: () => refreshFxIfDue() },
  // Keeps rate_limits and Better Auth's rate_limit small (counters older than an hour, at most 5000 rows per table per run).
  { name: "rate-limit-cleanup", everyMs: 60 * MINUTE, run: () => deleteExpiredRateLimits() },
];

const controller = new AbortController();
for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.once(sig, () => {
    console.log(`[worker] ${sig} received, finishing the current task`);
    controller.abort();
  });
}

console.log("[worker] started");
runLoop(tasks, controller.signal)
  .catch((err: unknown) => {
    console.error("[worker] crashed", err instanceof Error ? err.message : "unknown error");
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
    console.log("[worker] stopped");
  });
