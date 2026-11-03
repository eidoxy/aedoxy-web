import { isIP } from "node:net";

/**
 * Client address from request headers. In production every request arrives through the Cloudflare Tunnel, which
 * sets cf-connecting-ip itself, so that is the only header trusted there: x-forwarded-for and x-real-ip can be
 * written by the client. Outside production the fallbacks keep local runs and tests working.
 * The first header that is present decides: if it is not a valid address the result is null, never a weaker header.
 */
export function clientIp(headers: Headers): string | null {
  const production = process.env.NODE_ENV === "production";
  const sources = production ? (["cf-connecting-ip"] as const) : (["cf-connecting-ip", "x-real-ip", "x-forwarded-for"] as const);
  for (const name of sources) {
    const raw = headers.get(name);
    if (raw === null) continue;
    // x-forwarded-for is a list ("client, proxy1, ..."); the single-address headers must hold exactly one address.
    const value = (name === "x-forwarded-for" ? raw.split(",")[0] : raw).trim().toLowerCase();
    if (value.length === 0 || value.length > 45 || !isIP(value)) return null;
    return value.startsWith("::ffff:") && isIP(value.slice(7)) === 4 ? value.slice(7) : value;
  }
  return null;
}
