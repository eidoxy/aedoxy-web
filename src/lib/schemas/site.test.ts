import { describe, expect, it } from "vitest";
import { announcementSchema, brandSchema, contactSchema, docsSchema, fillLegalPlaceholder, isSafeHref, mergeSiteSettings, type SiteSettings } from "./site";

const defaults: SiteSettings = {
  brandName: "aedoxy",
  tagline: "t",
  description: "d",
  hideWordmark: false,
  companyName: "",
  companyAddress: "",
  supportEmail: "",
  whatsappUrl: "",
  telegramUrl: "",
  announcement: { enabled: false, text: "", href: "", linkLabel: "" },
  apiBaseUrl: "https://ai.example.com",
  sampleModel: "your-model-id",
};

describe("brandSchema", () => {
  it("trims, needs a name of 1-40 characters and limits tagline and description", () => {
    expect(brandSchema.parse({ brandName: "  Acme  ", tagline: "", description: "" }).brandName).toBe("Acme");
    expect(brandSchema.safeParse({ brandName: "", tagline: "", description: "" }).success).toBe(false);
    expect(brandSchema.safeParse({ brandName: "x".repeat(41), tagline: "", description: "" }).success).toBe(false);
    expect(brandSchema.safeParse({ brandName: "x".repeat(40), tagline: "x".repeat(121), description: "" }).success).toBe(false);
    expect(brandSchema.safeParse({ brandName: "x", tagline: "x".repeat(120), description: "x".repeat(301) }).success).toBe(false);
    expect(brandSchema.safeParse({ brandName: "x", tagline: "x".repeat(120), description: "x".repeat(300) }).success).toBe(true);
  });
});

describe("contactSchema", () => {
  const ok = { companyName: "PT A", companyAddress: "Jl. B", supportEmail: "halo@example.com", whatsappUrl: "https://wa.me/62812", telegramUrl: "" };
  it("takes a valid email, https links, or empty values", () => {
    expect(contactSchema.safeParse(ok).success).toBe(true);
    expect(contactSchema.safeParse({ ...ok, supportEmail: "", whatsappUrl: "" }).success).toBe(true);
  });
  it("rejects a bad email, non-https links, credentials and an address over 300 characters", () => {
    expect(contactSchema.safeParse({ ...ok, supportEmail: "not-an-email" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, whatsappUrl: "http://wa.me/1" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, telegramUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, telegramUrl: "https://user:pw@t.me/x" }).success).toBe(false);
    expect(contactSchema.safeParse({ ...ok, companyAddress: "x".repeat(301) }).success).toBe(false);
  });
});

describe("announcementSchema", () => {
  const ok = { enabled: true, text: "Promo", href: "/pricing", linkLabel: "Lihat" };
  it("accepts internal paths and https links", () => {
    expect(announcementSchema.safeParse(ok).success).toBe(true);
    expect(announcementSchema.safeParse({ ...ok, href: "https://example.com/a?b=1" }).success).toBe(true);
  });
  it("rejects other schemes, protocol-relative links, and over-long text or label", () => {
    for (const href of ["javascript:alert(1)", "http://example.com", "//evil.example", "/\\evil.example", "data:text/html,x", "pricing"]) {
      expect(announcementSchema.safeParse({ ...ok, href }).success, href).toBe(false);
    }
    expect(announcementSchema.safeParse({ ...ok, text: "x".repeat(141) }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...ok, linkLabel: "x".repeat(25) }).success).toBe(false);
  });
  it("needs text, link and label only while enabled", () => {
    expect(announcementSchema.safeParse({ enabled: true, text: "", href: "", linkLabel: "" }).success).toBe(false);
    expect(announcementSchema.safeParse({ enabled: false, text: "", href: "", linkLabel: "" }).success).toBe(true);
  });
  it("isSafeHref", () => {
    expect(isSafeHref("/")).toBe(true);
    expect(isSafeHref("/a b")).toBe(false);
  });
});

describe("docsSchema", () => {
  it("takes https, and http only for localhost; strips trailing slashes", () => {
    expect(docsSchema.parse({ apiBaseUrl: "https://ai.example.com/", sampleModel: "gpt-4o" }).apiBaseUrl).toBe("https://ai.example.com");
    expect(docsSchema.safeParse({ apiBaseUrl: "http://localhost:3000", sampleModel: "m" }).success).toBe(true);
    expect(docsSchema.safeParse({ apiBaseUrl: "http://127.0.0.1:3000", sampleModel: "m" }).success).toBe(true);
  });
  it("rejects plain http elsewhere, other schemes, credentials, queries", () => {
    for (const apiBaseUrl of ["http://ai.example.com", "ftp://x.com", "javascript:1", "https://u:p@x.com", "https://x.com/?a=1", "x.com", "http://localhost.evil.com"]) {
      expect(docsSchema.safeParse({ apiBaseUrl, sampleModel: "m" }).success, apiBaseUrl).toBe(false);
    }
  });
  it("keeps quotes and spaces out of the sample model", () => {
    for (const sampleModel of ['a"b', "a b", "a'b", "", "$(x)"]) expect(docsSchema.safeParse({ apiBaseUrl: "https://x.com", sampleModel }).success, sampleModel).toBe(false);
    expect(docsSchema.safeParse({ apiBaseUrl: "https://x.com", sampleModel: "anthropic/claude-3.5:beta" }).success).toBe(true);
  });
});

describe("mergeSiteSettings", () => {
  it("uses the defaults when nothing is stored", () => {
    expect(mergeSiteSettings(undefined, defaults)).toEqual(defaults);
    expect(mergeSiteSettings({}, defaults)).toEqual(defaults);
  });
  it("lets stored fields win and merges the announcement field by field", () => {
    const m = mergeSiteSettings({ brandName: "Acme", announcement: { enabled: true, text: "Hi" } }, defaults);
    expect(m.brandName).toBe("Acme");
    expect(m.tagline).toBe("t");
    expect(m.announcement).toEqual({ enabled: true, text: "Hi", href: "", linkLabel: "" });
  });
  it("falls back to the defaults as a whole when the stored value is not valid", () => {
    expect(mergeSiteSettings({ brandName: 5 }, defaults)).toEqual(defaults);
    expect(mergeSiteSettings("junk", defaults)).toEqual(defaults);
    expect(mergeSiteSettings({ brandName: "x".repeat(99) }, defaults)).toEqual(defaults);
  });
});

describe("fillLegalPlaceholder", () => {
  const s = { companyName: "PT Acme", companyAddress: "Jl. Mawar 1", supportEmail: "halo@acme.id" };
  it("fills the three known placeholders", () => {
    expect(fillLegalPlaceholder("ISI: nama badan usaha atau penyelenggara", s)).toBe("PT Acme");
    expect(fillLegalPlaceholder("ISI: alamat badan usaha", s)).toBe("Jl. Mawar 1");
    expect(fillLegalPlaceholder("ISI: email kontak resmi", s)).toBe("halo@acme.id");
  });
  it("leaves other placeholders, and empty settings, as they are", () => {
    expect(fillLegalPlaceholder("ISI: tanggal berlaku", s)).toBeNull();
    expect(fillLegalPlaceholder("ISI: email kontak resmi", { ...s, supportEmail: "" })).toBeNull();
  });
});
