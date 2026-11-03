import { describe, expect, it } from "vitest";
import { bannedMessage, formatBanDate, signInErrorMessage, socialErrorMessage } from "./auth-messages";

describe("bannedMessage", () => {
  it("names the reason and points to support", () => {
    expect(bannedMessage({ banReason: "Penyalahgunaan API" })).toBe("Akun Anda diblokir. Alasan: Penyalahgunaan API. Hubungi dukungan bila Anda merasa ini keliru.");
  });

  it("leaves the reason out when there is none", () => {
    for (const banReason of [null, undefined, "", "  \n "]) {
      expect(bannedMessage({ banReason })).toBe("Akun Anda diblokir. Hubungi dukungan bila Anda merasa ini keliru.");
    }
  });

  it("states the end of a temporary ban in UTC", () => {
    const msg = bannedMessage({ banReason: "Spam.", banExpires: new Date("2026-11-05T08:04:00Z") });
    expect(msg).toBe("Akun Anda diblokir sampai 5 November 2026 08.04 UTC. Alasan: Spam. Hubungi dukungan bila Anda merasa ini keliru.");
    expect(formatBanDate(new Date("2026-01-31T23:59:00Z"))).toBe("31 Januari 2026 23.59 UTC");
  });

  it("ignores an unreadable end date", () => {
    expect(bannedMessage({ banExpires: "not a date" })).not.toContain("sampai");
  });

  it("keeps the reason on one line and cuts it at 200 characters", () => {
    const msg = bannedMessage({ banReason: `baris satu\nbaris dua ${"x".repeat(400)}` });
    expect(msg).not.toContain("\n");
    expect(msg).toContain("baris satu baris dua");
    expect(msg.match(/Alasan: (.*)\. Hubungi/)![1].length).toBeLessThanOrEqual(203);
    expect(msg).toContain("...");
  });
});

describe("signInErrorMessage", () => {
  const fallback = "Username/email atau kata sandi salah.";

  it("shows the server's ban message", () => {
    expect(signInErrorMessage({ code: "BANNED_USER", status: 403, message: "Akun Anda diblokir. Alasan: X." }, fallback)).toBe("Akun Anda diblokir. Alasan: X.");
  });

  it("builds a ban message when the server's text did not arrive", () => {
    expect(signInErrorMessage({ code: "BANNED_USER", message: " " }, fallback)).toMatch(/^Akun Anda diblokir\./);
  });

  it("keeps the generic text for wrong credentials and never mentions a ban", () => {
    expect(signInErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD", status: 401, message: "Invalid email or password" }, fallback)).toBe(fallback);
    expect(signInErrorMessage({}, fallback)).toBe(fallback);
  });

  it("tells a rate limit apart", () => {
    expect(signInErrorMessage({ status: 429 }, fallback)).toMatch(/Terlalu banyak/);
  });
});

describe("socialErrorMessage", () => {
  it("returns nothing without an error", () => {
    expect(socialErrorMessage(undefined)).toBeUndefined();
    expect(socialErrorMessage("")).toBeUndefined();
  });

  it("maps a ban and a switched-off provider to fixed texts", () => {
    expect(socialErrorMessage("BANNED_USER")).toMatch(/^Akun Anda diblokir\./);
    expect(socialErrorMessage("banned_user")).toMatch(/^Akun Anda diblokir\./);
    expect(socialErrorMessage("social_login_disabled_github")).toBe("Login dengan GitHub sedang dinonaktifkan.");
    expect(socialErrorMessage(["SOCIAL_LOGIN_DISABLED_GOOGLE"])).toBe("Login dengan Google sedang dinonaktifkan.");
  });

  it("answers any other code with the generic text, never echoing it", () => {
    const msg = socialErrorMessage("<script>alert(1)</script>");
    expect(msg).toBe("Masuk dengan akun sosial gagal. Coba lagi atau gunakan cara masuk lain.");
    expect(msg).not.toContain("script");
  });
});
