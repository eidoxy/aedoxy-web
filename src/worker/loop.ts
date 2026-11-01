/**
 * Minimal scheduler: every task runs on its own interval, one at a time, in
 * this process. Aborting the signal lets the task that is running finish, then
 * resolves; no new task starts. A task that throws is logged and runs again on
 * its next interval.
 */
export type WorkerTask = { name: string; everyMs: number; run: (signal: AbortSignal) => Promise<unknown> };

export async function runLoop(tasks: WorkerTask[], signal: AbortSignal, tickMs = 1_000): Promise<void> {
  const nextAt = new Map(tasks.map((t) => [t.name, 0]));

  while (!signal.aborted) {
    for (const task of tasks) {
      if (signal.aborted) break;
      if (Date.now() < (nextAt.get(task.name) ?? 0)) continue;
      try {
        await task.run(signal);
      } catch (err) {
        console.error(`[worker] task ${task.name} failed`, err instanceof Error ? err.message : "unknown error");
      }
      nextAt.set(task.name, Date.now() + task.everyMs);
    }
    if (signal.aborted) break; // an abort event that fired mid-task would not be seen by the listener below
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", done);
        resolve();
      }, tickMs);
      signal.addEventListener("abort", done, { once: true });
    });
  }
}
