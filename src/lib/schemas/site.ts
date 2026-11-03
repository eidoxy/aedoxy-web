import { z } from "zod";

/** Public site settings (admin > Pengaturan situs). Pure: safe to import from client components. */

/** Shown in code samples until the admin picks a model. */
export const DEFAULT_SAMPLE_MODEL = "your-model-id";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseUrl(v: string): URL | null {
  try {
    return new URL(v);
  } catch {
    return null;
  }
}

export const isHttpsUrl = (v: string) => {
  const u = parseUrl(v);
  return u !== null && u.protocol === "https:" && !u.username && !u.password;
};

/** Internal path ("/pricing") or https URL. "//host" and backslashes are rejected: browsers read them as another origin. */
export const isSafeHref = (v: string) => (v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") && !/[\s<>]/.test(v)) || isHttpsUrl(v);

/** https, or http for localhost only; origin plus optional path, no query, hash or credentials. */
export function isApiBaseUrl(v: string) {
  const u = parseUrl(v);
  if (!u || u.username || u.password || u.search || u.hash) return false;
  return u.protocol === "https:" || (u.protocol === "http:" && LOCAL_HOSTS.has(u.hostname));
}

const str = (max: number, min = 0, what = "Isian") =>
  z
    .string()
    .trim()
    .min(min, min > 0 ? `${what} wajib diisi.` : undefined)
    .max(max, `${what} maksimal ${max} karakter.`);

const optionalHttps = (what: string) =>
  z
    .string()
    .trim()
    .max(300, `${what} maksimal 300 karakter.`)
    .refine((v) => v === "" || isHttpsUrl(v), `${what} harus berupa URL https atau dikosongkan.`);

export const brandSchema = z.object({
  brandName: str(40, 1, "Nama brand"),
  tagline: str(120, 0, "Tagline"),
  description: str(300, 0, "Deskripsi"),
});

export const logoOptionsSchema = z.object({ hideWordmark: z.boolean() });

export const contactSchema = z.object({
  companyName: str(120, 0, "Nama badan usaha"),
  companyAddress: str(300, 0, "Alamat"),
  supportEmail: z
    .string()
    .trim()
    .max(120, "Email maksimal 120 karakter.")
    .refine((v) => v === "" || z.email().safeParse(v).success, "Email tidak valid."),
  whatsappUrl: optionalHttps("Tautan WhatsApp"),
  telegramUrl: optionalHttps("Tautan Telegram"),
});

/** Both default to on: a provider shows up as soon as its credentials are set in the server env. */
export const socialSchema = z.object({ googleLoginEnabled: z.boolean(), githubLoginEnabled: z.boolean() });

export const announcementBase = z.object({
  enabled: z.boolean(),
  text: str(140, 0, "Teks pengumuman"),
  href: z
    .string()
    .trim()
    .max(300, "Tautan maksimal 300 karakter.")
    .refine((v) => v === "" || isSafeHref(v), "Tautan harus path internal (diawali /) atau URL https."),
  linkLabel: str(24, 0, "Label tautan"),
});

export const announcementSchema = announcementBase.superRefine((v, ctx) => {
  if (!v.enabled) return;
  for (const k of ["text", "href", "linkLabel"] as const) {
    if (!v[k]) ctx.addIssue({ code: "custom", path: [k], message: "Wajib diisi bila pengumuman aktif." });
  }
});

export const docsSchema = z.object({
  apiBaseUrl: z
    .string()
    .trim()
    .max(200, "Base URL maksimal 200 karakter.")
    .refine(isApiBaseUrl, "Base URL harus https (http hanya untuk localhost), tanpa query atau kredensial.")
    .transform((v) => v.replace(/\/+$/, "")),
  // Interpolated into code samples, so quotes and spaces are not allowed.
  sampleModel: z
    .string()
    .trim()
    .min(1, "Contoh model wajib diisi.")
    .max(80, "Contoh model maksimal 80 karakter.")
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/, "Contoh model hanya boleh huruf, angka, dan . _ : / @ -"),
});

export const siteSettingsSchema = brandSchema
  .extend(logoOptionsSchema.shape)
  .extend(contactSchema.shape)
  .extend(socialSchema.shape)
  .extend({ announcement: announcementBase })
  .extend({ apiBaseUrl: z.string(), sampleModel: z.string() });

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

const storedSchema = siteSettingsSchema.partial().extend({ announcement: announcementBase.partial().optional() });

/**
 * Stored value over the defaults. A stored value that no longer parses (it is validated on write, so this means
 * manual edits) is ignored as a whole rather than half-applied.
 */
export function mergeSiteSettings(stored: unknown, defaults: SiteSettings): SiteSettings {
  const parsed = storedSchema.safeParse(stored ?? {});
  if (!parsed.success) return defaults;
  const { announcement, ...rest } = parsed.data;
  const defined = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  const ann = Object.fromEntries(Object.entries(announcement ?? {}).filter(([, v]) => v !== undefined));
  return { ...defaults, ...defined, announcement: { ...defaults.announcement, ...ann } };
}

export type SiteSection = "brand" | "logo" | "contact" | "social" | "announcement" | "docs";

/** Fields each section owns; the audit row lists only these. */
export const SECTION_FIELDS: Record<SiteSection, readonly (keyof SiteSettings)[]> = {
  brand: ["brandName", "tagline", "description"],
  logo: ["hideWordmark"],
  contact: ["companyName", "companyAddress", "supportEmail", "whatsappUrl", "telegramUrl"],
  social: ["googleLoginEnabled", "githubLoginEnabled"],
  announcement: ["announcement"],
  docs: ["apiBaseUrl", "sampleModel"],
};

/** Legal pages: the three placeholders the settings can fill. Anything else stays `[ISI: ...]`. */
export function fillLegalPlaceholder(label: string, s: Pick<SiteSettings, "companyName" | "companyAddress" | "supportEmail">): string | null {
  const byLabel: Record<string, string> = {
    "ISI: nama badan usaha atau penyelenggara": s.companyName,
    "ISI: alamat badan usaha": s.companyAddress,
    "ISI: email kontak resmi": s.supportEmail,
  };
  return byLabel[label.trim()] || null;
}
