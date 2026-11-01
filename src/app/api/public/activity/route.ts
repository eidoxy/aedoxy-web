import { getActivity } from "@/server/catalog";

// Public by design (F07): masked labels and plan names only. No ids, emails or prices.
// TODO(F07): per-IP rate limit; the `use cache` window (30s) already absorbs most traffic.
export async function GET() {
  const items = await getActivity();
  return Response.json(items, { headers: { "Cache-Control": "public, max-age=30, s-maxage=30" } });
}
