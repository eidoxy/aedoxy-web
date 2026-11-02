import { ASSET_KINDS } from "@/lib/image-check";
import { getAssetBody, getAssetHead } from "@/server/domain/site-settings";

// Public by design (logo, favicon, link preview). URLs carry ?v=<sha8>, so a long stale-while-revalidate is safe.
const CACHE = "public, max-age=300, stale-while-revalidate=86400";
const SAFE = {
  "X-Content-Type-Options": "nosniff",
  // Opening the image URL directly can never run anything, whatever the bytes are.
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

const plain = (status: number, cache: string) => new Response(null, { status, headers: { "Cache-Control": cache, ...SAFE } });

/** `If-None-Match` may list several tags, weak ones (W/) and `*`. */
function matches(header: string | null, etag: string) {
  if (!header) return false;
  return header.split(",").some((t) => {
    const v = t.trim().replace(/^W\//, "");
    return v === "*" || v === etag;
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!(ASSET_KINDS as readonly string[]).includes(kind)) return plain(404, "public, max-age=60");

  try {
    const head = await getAssetHead(kind);
    // No upload for this kind: the site uses its built-in image. Short cache so a new upload shows quickly.
    if (!head) return plain(404, "public, max-age=60");

    const etag = `"${head.sha256}"`;
    const headers = { ETag: etag, "Cache-Control": CACHE, ...SAFE };
    if (matches(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });

    const body = await getAssetBody(kind);
    if (!body) return plain(404, "public, max-age=60"); // reset between the two reads
    // The ETag of what is actually sent, in case the image was replaced between the two reads.
    return new Response(new Uint8Array(body.bytes), {
      headers: { ...headers, ETag: `"${body.sha256}"`, "Content-Type": body.contentType, "Content-Length": String(body.bytes.length) },
    });
  } catch (err) {
    console.error("[brand] asset lookup failed", err instanceof Error ? err.message : "unknown");
    return plain(503, "no-store");
  }
}
