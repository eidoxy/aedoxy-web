import { headers } from "next/headers";
import { hitRateLimit } from "@/server/rate-limit";
import { getActivity } from "@/server/catalog";

// Public by design (F07): masked labels and plan names only. No ids, emails or prices.

export async function GET() {
  const h = await headers();
  // shortcut: trusts x-forwarded-for as sent by the proxy in front; configure the proxy to overwrite it.
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "unknown";
  // Fails open: this feed is public and low-risk, so a limiter outage must not take it down.
  const { allowed } = await hitRateLimit({ key: `public:activity:${ip.slice(0, 64)}`, windowMs: 60_000, max: 30, failOpen: true });
  if (!allowed) {
    return Response.json({ error: "Terlalu banyak permintaan." }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const items = await getActivity();
  return Response.json(items, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
}
