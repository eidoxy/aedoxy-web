/**
 * Upload validation for site images, written by hand (no image dependency). The type comes from the magic
 * bytes, never from the file name or the client's Content-Type, and the size from the file header.
 * SVG is not accepted: it can carry script.
 */

export const ASSET_KINDS = ["logo", "favicon", "og"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export type ImageType = "image/png" | "image/jpeg" | "image/webp" | "image/x-icon";

export const ASSET_LABEL: Record<AssetKind, string> = { logo: "Logo", favicon: "Favicon", og: "Gambar OG" };

export const ASSET_RULES: Record<AssetKind, { types: readonly ImageType[]; maxBytes: number; hint: string }> = {
  logo: { types: ["image/png", "image/jpeg", "image/webp"], maxBytes: 512 * 1024, hint: "PNG, JPEG, atau WebP. Sisi terpanjang 64 sampai 2048 px, maksimal 512 KB." },
  favicon: { types: ["image/png", "image/x-icon"], maxBytes: 256 * 1024, hint: "PNG atau ICO. Persegi, minimal 32 px, maksimal 256 KB." },
  og: { types: ["image/png", "image/jpeg", "image/webp"], maxBytes: 1024 * 1024, hint: "PNG, JPEG, atau WebP. Disarankan 1200 x 630 px, maksimal 1 MB." },
};

export const OG_SIZE = { width: 1200, height: 630 };

/** Message is Indonesian and safe to show to the admin. */
export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageError";
  }
}

export type ImageInfo = { contentType: ImageType; width: number; height: number };

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.subarray(o, o + n));
const bad = () => new ImageError("File gambar rusak atau tidak lengkap.");

function pngSize(b: Uint8Array) {
  // 8 signature + IHDR chunk (length 13), and the file must end with an IEND chunk.
  if (b.length < 33 || u32be(b, 8) !== 13 || ascii(b, 12, 4) !== "IHDR") throw bad();
  if (ascii(b, b.length - 8, 4) !== "IEND") throw bad();
  return { width: u32be(b, 16), height: u32be(b, 20) };
}

function jpegSize(b: Uint8Array) {
  if (b[b.length - 2] !== 0xff || b[b.length - 1] !== 0xd9) throw bad();
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) throw bad();
    while (b[p] === 0xff && p < b.length) p++;
    const marker = b[p++];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) break; // image data starts before any frame header
    const len = u16be(b, p);
    if (len < 2 || p + len > b.length) throw bad();
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (len < 8) throw bad();
      return { height: u16be(b, p + 3), width: u16be(b, p + 5) };
    }
    p += len;
  }
  throw bad();
}

function webpSize(b: Uint8Array) {
  if (b.length < 30 || u32le(b, 4) + 8 !== b.length) throw bad();
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) throw bad();
    return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (b[20] !== 0x2f) throw bad();
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
  throw bad();
}

const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

function icoSize(b: Uint8Array) {
  const count = u16le(b, 4);
  if (count < 1 || count > 64 || b.length < 6 + count * 16) throw bad();
  let best = { width: 0, height: 0 };
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16;
    const width = b[o] || 256;
    const height = b[o + 1] || 256;
    if (u32le(b, o + 8) === 0 || u32le(b, o + 12) + u32le(b, o + 8) > b.length) throw bad();
    if (width * height > best.width * best.height) best = { width, height };
  }
  return best;
}

function sniff(b: Uint8Array): ImageType | null {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  if (b.length >= 6 && b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "image/x-icon";
  return null;
}

// Markup inside an image is never legitimate: refuse files that double as HTML/SVG (polyglots).
const MARKUP = /<\s*(script|html|svg|iframe|body|object|embed)\b/i;

/** Checks type, size and dimensions for `kind`. Throws ImageError (Indonesian message) on the first problem. */
export function inspectImage(bytes: Uint8Array, kind: AssetKind): ImageInfo & { warning?: string } {
  const rules = ASSET_RULES[kind];
  if (bytes.length === 0) throw new ImageError("File kosong.");
  if (bytes.length > rules.maxBytes) throw new ImageError(`${ASSET_LABEL[kind]} maksimal ${rules.maxBytes / 1024} KB.`);

  const contentType = sniff(bytes);
  if (!contentType || !rules.types.includes(contentType)) throw new ImageError(`Jenis file tidak diterima. ${rules.hint} SVG tidak diizinkan.`);

  const { width, height } = contentType === "image/png" ? pngSize(bytes) : contentType === "image/jpeg" ? jpegSize(bytes) : contentType === "image/webp" ? webpSize(bytes) : icoSize(bytes);
  if (!(width > 0 && height > 0)) throw bad();
  if (MARKUP.test(new TextDecoder("latin1").decode(bytes))) throw new ImageError("File berisi markup yang tidak diizinkan.");

  const long = Math.max(width, height);
  if (kind === "logo" && (long < 64 || long > 2048)) throw new ImageError(`Sisi terpanjang logo harus 64 sampai 2048 px (file ini ${width} x ${height}).`);
  if (kind === "favicon") {
    if (width !== height) throw new ImageError(`Favicon harus persegi (file ini ${width} x ${height}).`);
    if (width < 32) throw new ImageError("Favicon minimal 32 x 32 px.");
  }
  if (kind === "og" && (long > 4096 || Math.min(width, height) < 200)) throw new ImageError(`Ukuran gambar OG tidak wajar (${width} x ${height}). Pakai sekitar 1200 x 630 px.`);

  const warning = kind === "og" && (width !== OG_SIZE.width || height !== OG_SIZE.height) ? `Ukuran ${width} x ${height}, disarankan ${OG_SIZE.width} x ${OG_SIZE.height} px.` : undefined;
  return { contentType, width, height, warning };
}

/** `/brand/logo?v=ab12cd34`: the version changes whenever the file changes, so caches never serve the old image. */
export const assetUrl = (kind: AssetKind, sha256: string) => `/brand/${kind}?v=${sha256.slice(0, 8)}`;
