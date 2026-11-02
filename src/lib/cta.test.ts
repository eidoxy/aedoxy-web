import { describe, expect, it } from "vitest";
import { pickCta } from "./cta";

const anonymous = { label: "Dapatkan API key", href: "/register" };

describe("pickCta", () => {
  it("keeps the anonymous label and target without a session", () => {
    expect(pickCta(false, anonymous)).toBe(anonymous);
  });

  it("switches to the dashboard with a session", () => {
    expect(pickCta(true, anonymous)).toEqual({ label: "Dashboard", href: "/dashboard" });
  });
});
