import { describe, expect, it, vi } from "vitest";
import { runLoop } from "./loop";

describe("runLoop", () => {
  it("runs each task on its interval and keeps going after a task throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ac = new AbortController();
    let good = 0;
    let bad = 0;
    const loop = runLoop(
      [
        { name: "good", everyMs: 20, run: async () => void good++ },
        {
          name: "bad",
          everyMs: 20,
          run: async () => {
            bad++;
            throw new Error("boom");
          },
        },
      ],
      ac.signal,
      5,
    );
    await new Promise((r) => setTimeout(r, 150));
    ac.abort();
    await loop;
    expect(good).toBeGreaterThan(2);
    expect(bad).toBeGreaterThan(2);
    vi.restoreAllMocks();
  });

  it("on abort lets the running task finish, starts nothing new and resolves", async () => {
    const ac = new AbortController();
    const events: string[] = [];
    const loop = runLoop(
      [
        {
          name: "slow",
          everyMs: 0,
          run: async () => {
            events.push("start");
            ac.abort(); // SIGTERM arrives mid-task
            await new Promise((r) => setTimeout(r, 50));
            events.push("end");
          },
        },
        { name: "after", everyMs: 0, run: async () => void events.push("after") },
      ],
      ac.signal,
      1_000,
    );
    const started = Date.now();
    await loop;
    expect(events).toEqual(["start", "end"]);
    expect(Date.now() - started).toBeLessThan(500); // did not wait for the 1 s tick
  });

  it("returns at once when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const run = vi.fn();
    await runLoop([{ name: "t", everyMs: 0, run }], ac.signal);
    expect(run).not.toHaveBeenCalled();
  });
});
