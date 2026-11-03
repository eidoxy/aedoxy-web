import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, isEmailIdentifier, loginSchema, registerSchema, resetPasswordSchema } from "./auth";

describe("auth schemas", () => {
  it("accepts a username or an email on login and trims it", () => {
    expect(loginSchema.safeParse({ identifier: "  a@b.co ", password: "x" })).toMatchObject({ success: true, data: { identifier: "a@b.co" } });
    expect(loginSchema.safeParse({ identifier: " ada_1 ", password: "x" })).toMatchObject({ success: true, data: { identifier: "ada_1" } });
    expect(loginSchema.safeParse({ identifier: "  ", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ identifier: "a@b.co", password: "" }).success).toBe(false);
  });

  it("tells emails and usernames apart by the @", () => {
    expect(isEmailIdentifier("a@b.co")).toBe(true);
    expect(isEmailIdentifier("ada_1")).toBe(false);
  });

  it("requires a 10 character password on register", () => {
    const base = { username: "ada_l", email: "a@b.co" };
    expect(registerSchema.safeParse({ ...base, password: "123456789" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "1234567890" }).success).toBe(true);
  });

  it("lowercases the username and explains what is wrong with it in Indonesian", () => {
    const base = { email: "a@b.co", password: "1234567890" };
    expect(registerSchema.safeParse({ ...base, username: " Ada_L " })).toMatchObject({ success: true, data: { username: "ada_l" } });
    const messageFor = (username: string) => {
      const r = registerSchema.safeParse({ ...base, username });
      return r.success ? null : r.error.issues[0].message;
    };
    expect(messageFor("ab")).toBe("Username 3 sampai 20 karakter");
    expect(messageFor("a".repeat(21))).toBe("Username 3 sampai 20 karakter");
    expect(messageFor("ada.l")).toMatch(/huruf kecil, angka/);
    expect(messageFor("admin")).toBe("Username ini tidak tersedia");
  });
  it("rejects an invalid email when asking for a reset link", () => {
    expect(forgotPasswordSchema.safeParse({ email: "x" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
  });

  it("requires matching passwords on reset", () => {
    const bad = resetPasswordSchema.safeParse({ password: "1234567890", confirm: "1234567891" });
    expect(bad.success).toBe(false);
    expect(!bad.success && bad.error.issues[0].path).toEqual(["confirm"]);
    expect(resetPasswordSchema.safeParse({ password: "1234567890", confirm: "1234567890" }).success).toBe(true);
  });
});
