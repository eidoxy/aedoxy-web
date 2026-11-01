import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "./auth";

describe("auth schemas", () => {
  it("trims and validates the email on login", () => {
    expect(loginSchema.safeParse({ email: "  a@b.co ", password: "x" })).toMatchObject({ success: true, data: { email: "a@b.co" } });
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("requires a 10 character password on register", () => {
    const base = { name: "Ada", email: "a@b.co" };
    expect(registerSchema.safeParse({ ...base, password: "123456789" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, password: "1234567890" }).success).toBe(true);
    expect(registerSchema.safeParse({ ...base, name: "A", password: "1234567890" }).success).toBe(false);
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
