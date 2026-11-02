import { getAdminAccess } from "@/server/admin";
import { ledgerCsv } from "@/server/domain/admin-pool";

/** GET /admin/pool/export?type=&from=&to= : the filtered ledger as CSV. Admin with 2FA only; anyone else sees a bare 404. */
export async function GET(request: Request) {
  if ((await getAdminAccess()).kind !== "ok") return new Response(null, { status: 404 });

  const q = new URL(request.url).searchParams;
  const csv = await ledgerCsv({ type: q.get("type") ?? undefined, from: q.get("from") ?? undefined, to: q.get("to") ?? undefined });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="pool-ledger-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
