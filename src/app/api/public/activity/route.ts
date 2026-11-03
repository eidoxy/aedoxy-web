import { headers } from "next/headers";
import { clientIp } from "@/server/client-ip";
import { hitRateLimit } from "@/server/rate-limit";
import { getActivity } from "@/server/catalog";

// Public by design (F07): masked labels and plan names only. No ids, emails or prices.

export async function GET() {
  const h = await headers();
  // No trusted address: one shared, stricter bucket instead of no limit.
  const ip = clientIp(h) ?? "unknown";
  // Fails open: this feed is public and low-risk, so a limiter outage must not take it down.
  const { allowed } = await hitRateLimit({ key: `public:activity:${ip}`, windowMs: 60_000, max: 30, failOpen: true });
  if (!allowed) {
    return Response.json({ error: "Terlalu banyak permintaan." }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const items = await getActivity();
  return Response.json(items, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
}
