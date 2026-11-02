/**
 * CSV cell for text from the database or a user. A cell that starts with = + - @ (or a tab/CR)
 * is read as a formula by Excel and Sheets (CSV injection), so it gets a leading apostrophe.
 */
export function csvText(value: string): string {
  const s = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Numbers come from our own bigint columns and are written as they are (a negative number must stay a number). */
export function csvRow(cells: readonly (string | number | null | undefined)[]): string {
  return cells.map((c) => (c === null || c === undefined ? "" : typeof c === "number" ? String(c) : csvText(c))).join(",");
}
