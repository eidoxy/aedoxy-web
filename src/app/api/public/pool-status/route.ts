import { getPoolStatus } from "@/server/domain/pool-status";

// Public by design: only the coarse status, never quota amounts. Edge/CDN may cache it for 60 s.
export async function GET() {
  const status = await getPoolStatus();
  return Response.json({ status }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
