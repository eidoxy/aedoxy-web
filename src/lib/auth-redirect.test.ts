import { describe, expect, it } from "vitest";
import { oidcCarryQuery, safeInternalPath, signedInDestination } from "./auth-redirect";

describe("safeInternalPath", () => {
  it("keeps same-site paths", () => {
    expect(safeInternalPath("/plans")).toBe("/plans");
    expect(safeInternalPath("/orders/3?x=1#a")).toBe("/orders/3?x=1#a");
  });

  it.each([
    "//evil.com",
    "///evil.com",
    "/\\evil.com",
    "\\\\evil.com",
    "https://evil.com",
    "http://evil.com/x",
    "javascript:alert(1)",
    "evil.com",
    "",
    "/ok\r\nSet-Cookie: a=b",
    "/ok\tx",
  ])("rejects %j", (v) => {
    expect(safeInternalPath(v)).toBeNull();
  });

  it("rejects non-strings and takes the first of a repeated parameter", () => {
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath(42)).toBeNull();
    expect(safeInternalPath(["/plans", "//evil.com"])).toBe("/plans");
    expect(safeInternalPath(["//evil.com", "/plans"])).toBeNull();
  });
});

describe("signedInDestination", () => {
  it("defaults to the dashboard", () => {
    expect(signedInDestination({})).toBe("/dashboard");
  });

  it("returns to a safe callbackURL or next, callbackURL first", () => {
    expect(signedInDestination({ callbackURL: "/orders" })).toBe("/orders");
    expect(signedInDestination({ next: "/plans" })).toBe("/plans");
    expect(signedInDestination({ callbackURL: "/orders", next: "/plans" })).toBe("/orders");
  });

  it("ignores an unsafe target instead of following it", () => {
    expect(signedInDestination({ callbackURL: "//evil.com", next: "https://evil.com" })).toBe("/dashboard");
    expect(signedInDestination({ callbackURL: "https://evil.com", next: "/plans" })).toBe("/plans");
  });

  it("stays on the page for a console OIDC request", () => {
    expect(signedInDestination({ client_id: "aedoxy-console", sig: "abc", callbackURL: "/orders" })).toBeNull();
  });
});

describe("oidcCarryQuery", () => {
  it("carries the signed query, repeated keys included, and drops page-level messages", () => {
    const q = oidcCarryQuery({ client_id: "c", ba_param: ["client_id", "sig"], sig: "abc", error: "x", reset: "1" });
    expect(q).toBe("?client_id=c&ba_param=client_id&ba_param=sig&sig=abc");
  });

  it("adds nothing outside an OIDC request", () => {
    expect(oidcCarryQuery({})).toBe("");
    expect(oidcCarryQuery({ reset: "1", next: "/plans" })).toBe("");
  });
});
