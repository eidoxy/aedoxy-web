import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool as pgPool } from "@/server/db/client";
import { saveSiteAsset } from "@/server/domain/site-settings";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";
import { GET } from "./route";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(resetDatabase);

const actor = { id: "admin-1", ip: null };
const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const get = (kind: string, headers: Record<string, string> = {}) => GET(new Request(`https://aedoxy.test/brand/${kind}`, { headers }), { params: Promise.resolve({ kind }) });

describe("GET /brand/[kind]", () => {
  it("404 without an upload and for an unknown kind", async () => {
    expect((await get("logo")).status).toBe(404);
    expect((await get("banner")).status).toBe(404);
    expect((await get("..%2Fsecret")).status).toBe(404);
    expect(await (await get("logo")).text()).toBe("");
  });

  it("200 with the stored bytes, type, nosniff, ETag from the hash and the cache policy", async () => {
    await saveSiteAsset(actor, "logo", bytes, { contentType: "image/png", width: 8, height: 8 });
    const res = await get("logo");
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300, stale-while-revalidate=86400");
    expect(res.headers.get("content-length")).toBe(String(bytes.length));
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{64}"$/);
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
  });

  it("304 without a body when If-None-Match matches (also weak and listed tags), 200 when it does not", async () => {
    await saveSiteAsset(actor, "favicon", bytes, { contentType: "image/png", width: 32, height: 32 });
    const etag = (await get("favicon")).headers.get("etag")!;
    for (const header of [etag, `W/${etag}`, `"other", ${etag}`, "*"]) {
      const res = await get("favicon", { "if-none-match": header });
      expect(res.status, header).toBe(304);
      expect(await res.text()).toBe("");
      expect(res.headers.get("etag")).toBe(etag);
      expect(res.headers.get("cache-control")).toContain("max-age=300");
    }
    expect((await get("favicon", { "if-none-match": '"stale"' })).status).toBe(200);
  });

  it("the ETag changes when the image is replaced", async () => {
    await saveSiteAsset(actor, "og", bytes, { contentType: "image/png", width: 1200, height: 630 });
    const first = (await get("og")).headers.get("etag");
    await saveSiteAsset(actor, "og", Buffer.concat([bytes, Buffer.from([9])]), { contentType: "image/png", width: 1200, height: 630 });
    const second = await get("og", { "if-none-match": first! });
    expect(second.status).toBe(200);
    expect(second.headers.get("etag")).not.toBe(first);
  });
});
