/** Admin inputs are Asia/Jakarta (WIB, UTC+7, no daylight saving), the zone the rest of the UI displays. */

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

/** "2026-11-02" or "2026-11-02T14:30" (WIB) -> Date, or null when malformed or not a real date. */
export function parseWib(value: string): Date | null {
  const m = LOCAL.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00"] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:00+07:00`);
  if (Number.isNaN(date.getTime())) return null;
  // new Date rolls 2026-02-31 over to March; reject it by round-tripping.
  return toWibInput(date).startsWith(`${y}-${mo}-${d}T${h}:${mi}`) ? date : null;
}

/** Date -> "YYYY-MM-DDTHH:mm" in WIB, for <input type="datetime-local">. */
export function toWibInput(date: Date): string {
  return new Date(date.getTime() + 7 * 3_600_000).toISOString().slice(0, 16);
}
