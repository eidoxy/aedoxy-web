import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "./client-ip";

afterEach(() => vi.unstubAllEnvs());
const h = (init: Record<string, string>) => new Headers(init);

describe("clientIp in production", () => {
  it("trusts only cf-connecting-ip and ignores x-forwarded-for and x-real-ip", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(clientIp(h({ "cf-connecting-ip": "203.0.113.5", "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" }))).toBe("203.0.113.5");
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4" }))).toBeNull();
    expect(clientIp(h({ "x-real-ip": "5.6.7.8" }))).toBeNull();
    expect(clientIp(h({}))).toBeNull();
  });

  it("does not fall back to a weaker header when cf-connecting-ip is invalid", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(clientIp(h({ "cf-connecting-ip": "not-an-ip", "x-forwarded-for": "1.2.3.4" }))).toBeNull();
  });
});

describe("clientIp validation (any environment)", () => {
  it("accepts IPv4 and IPv6, lower-cases IPv6 and unwraps IPv4-mapped addresses", () => {
    expect(clientIp(h({ "cf-connecting-ip": "2001:DB8::1" }))).toBe("2001:db8::1");
    expect(clientIp(h({ "cf-connecting-ip": "::ffff:192.0.2.1" }))).toBe("192.0.2.1");
    expect(clientIp(h({ "cf-connecting-ip": " 192.0.2.1 " }))).toBe("192.0.2.1");
  });

  it("rejects invalid values, lists in single-address headers, ports, empty and over-long values", () => {
    for (const bad of ["", "   ", "999.1.1.1", "1.2.3", "1.2.3.4:80", "1.2.3.4, 5.6.7.8", "a".repeat(46), "[::1]", "1.2.3.4/24"]) {
      expect(clientIp(h({ "cf-connecting-ip": bad })), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("clientIp outside production", () => {
  it("prefers cf-connecting-ip, then x-real-ip, then the first x-forwarded-for element", () => {
    vi.stubEnv("NODE_ENV", "test");
    expect(clientIp(h({ "cf-connecting-ip": "203.0.113.5", "x-real-ip": "5.6.7.8", "x-forwarded-for": "1.2.3.4" }))).toBe("203.0.113.5");
    expect(clientIp(h({ "x-real-ip": "5.6.7.8", "x-forwarded-for": "1.2.3.4" }))).toBe("5.6.7.8");
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4, 10.0.0.1, 10.0.0.2" }))).toBe("1.2.3.4");
    expect(clientIp(h({ "x-forwarded-for": "2001:db8::7, 10.0.0.1" }))).toBe("2001:db8::7");
    expect(clientIp(h({}))).toBeNull();
  });

  it("rejects an invalid first x-forwarded-for element", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(clientIp(h({ "x-forwarded-for": "unknown, 1.2.3.4" }))).toBeNull();
  });
});
