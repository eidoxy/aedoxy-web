/**
 * Sliding-window limiter keyed by string (an IP for public endpoints).
 * shortcut: in-memory per process, so it resets on restart and is not shared between instances; move to Postgres or Redis before running more than one web instance.
 */
export function createRateLimiter({ windowMs, max }: { windowMs: number; max: number }) {
  const hits = new Map<string, number[]>();
  return function allow(key: string, now = Date.now()): boolean {
    // Keeps memory bounded: drop idle keys once the map grows large.
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}
