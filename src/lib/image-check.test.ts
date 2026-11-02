import { describe, expect, it } from "vitest";
import { assetUrl, ImageError, inspectImage } from "./image-check";

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];
const le32 = (n: number) => [...le16(n), ...le16(n >>> 16)];
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

function png(w: number, h: number, extra: number[] = []) {
  return new Uint8Array([0x89, ...text("PNG"), 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...text("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...extra, ...be32(0), ...text("IEND"), 0xae, 0x42, 0x60, 0x82]);
}
function jpeg(w: number, h: number) {
  return new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, h >> 8, h & 255, w >> 8, w & 255, 1, 1, 0x11, 0, 0xff, 0xd9]);
}
function webp(w: number, h: number) {
  const body = [...text("WEBP"), ...text("VP8X"), ...le32(10), 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)];
  return new Uint8Array([...text("RIFF"), ...le32(body.length), ...body]);
}
function ico(w: number, h: number) {
  return new Uint8Array([0, 0, 1, 0, 1, 0, w === 256 ? 0 : w, h === 256 ? 0 : h, 0, 0, 1, 0, 32, 0, ...le32(4), ...le32(22), 1, 2, 3, 4]);
}

describe("inspectImage", () => {
  it("accepts valid PNG, JPEG, WebP and ICO and reads their size from the header", () => {
    expect(inspectImage(png(256, 128), "logo")).toMatchObject({ contentType: "image/png", width: 256, height: 128 });
    expect(inspectImage(jpeg(300, 100), "logo")).toMatchObject({ contentType: "image/jpeg", width: 300, height: 100 });
    expect(inspectImage(webp(1200, 630), "og")).toMatchObject({ contentType: "image/webp", width: 1200, height: 630, warning: undefined });
    expect(inspectImage(ico(32, 32), "favicon")).toMatchObject({ contentType: "image/x-icon", width: 32, height: 32 });
    expect(inspectImage(ico(0, 0), "favicon")).toMatchObject({ width: 256, height: 256 });
    expect(inspectImage(png(64, 64), "favicon")).toMatchObject({ contentType: "image/png" });
  });

  it("warns, but accepts, an OG image that is not 1200x630", () => {
    expect(inspectImage(png(800, 400), "og").warning).toMatch(/1200 x 630/);
  });

  it("rejects an empty file", () => {
    expect(() => inspectImage(new Uint8Array(), "logo")).toThrow("File kosong.");
  });

  it("rejects SVG, scripts and HTML whatever the extension or Content-Type says", () => {
    const enc = new TextEncoder();
    for (const body of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      "<?xml version='1.0'?><svg></svg>",
      "<html><script>alert(1)</script></html>",
      "alert(1)",
    ]) {
      expect(() => inspectImage(enc.encode(body), "logo"), body).toThrow(ImageError);
      expect(() => inspectImage(enc.encode(body), "favicon"), body).toThrow(/Jenis file tidak diterima/);
    }
  });

  it("rejects a polyglot: a valid PNG that also carries markup", () => {
    expect(() => inspectImage(png(128, 128, text("<script>alert(1)</script>")), "logo")).toThrow(/markup/);
    expect(() => inspectImage(png(128, 128, text("<SVG onload=x>")), "og")).toThrow(/markup/);
  });

  it("rejects a truncated file or one with trailing junk after the image", () => {
    expect(() => inspectImage(png(128, 128).subarray(0, 20), "logo")).toThrow(/rusak/);
    expect(() => inspectImage(new Uint8Array([...png(128, 128), ...text("<html>")]), "logo")).toThrow(ImageError);
    expect(() => inspectImage(jpeg(128, 128).subarray(0, 12), "logo")).toThrow(/rusak/);
    expect(() => inspectImage(webp(128, 128).subarray(0, 28), "logo")).toThrow(/rusak/);
  });

  it("rejects a type the kind does not take", () => {
    expect(() => inspectImage(jpeg(64, 64), "favicon")).toThrow(/Jenis file/);
    expect(() => inspectImage(ico(32, 32), "logo")).toThrow(/Jenis file/);
  });

  it("enforces dimensions per kind", () => {
    expect(() => inspectImage(png(63, 10), "logo")).toThrow(/64 sampai 2048/);
    expect(() => inspectImage(png(2049, 100), "logo")).toThrow(/64 sampai 2048/);
    expect(() => inspectImage(png(64, 20), "logo")).not.toThrow();
    expect(() => inspectImage(png(48, 32), "favicon")).toThrow(/persegi/);
    expect(() => inspectImage(png(16, 16), "favicon")).toThrow(/minimal 32/);
    expect(() => inspectImage(png(5000, 630), "og")).toThrow(/tidak wajar/);
  });

  it("enforces the size limit", () => {
    expect(() => inspectImage(png(128, 128, new Array(512 * 1024).fill(0)), "logo")).toThrow(/512 KB/);
    expect(() => inspectImage(png(64, 64, new Array(256 * 1024).fill(0)), "favicon")).toThrow(/256 KB/);
  });
});

describe("assetUrl", () => {
  it("carries the first 8 hash characters as the cache-busting version", () => {
    expect(assetUrl("logo", "0123456789abcdef")).toBe("/brand/logo?v=01234567");
  });
});
