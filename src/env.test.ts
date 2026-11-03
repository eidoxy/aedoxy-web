import { describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/env";

// `strict` is fixed when env.ts loads, so the ENV_STRICT=true case is checked in a separate process.
describe.each(["GOOGLE", "GITHUB"] as const)("%s_CLIENT_ID / %s_CLIENT_SECRET", (p) => {
  const id = `${p}_CLIENT_ID` as const;
  const secret = `${p}_CLIENT_SECRET` as const;

  it("may both be absent or empty", () => {
    expect(parseEnv({})[id]).toBeUndefined();
    expect(parseEnv({ [id]: "", [secret]: "" })[secret]).toBeUndefined();
  });

  it("pass through when both are set", () => {
    const env = parseEnv({ [id]: "id", [secret]: "secret" });
    expect([env[id], env[secret]]).toEqual(["id", "secret"]);
  });

  it("reject a single one without echoing the value", () => {
    expect(() => parseEnv({ [id]: "top-secret-id" })).toThrow(new RegExp(id));
    expect(() => parseEnv({ [secret]: "top-secret" })).toThrow(/together/);
    expect(() => parseEnv({ [id]: "top-secret-id" })).not.toThrow(/top-secret-id/);
  });
});

it("checks the Google and GitHub pairs independently", () => {
  const env = parseEnv({ GITHUB_CLIENT_ID: "gh", GITHUB_CLIENT_SECRET: "ghs" });
  expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  expect(() => parseEnv({ GITHUB_CLIENT_ID: "gh", GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs" })).toThrow(/GITHUB_CLIENT_ID/);
});

// `strict` is fixed when env.ts loads, so reload the module with ENV_STRICT=true.
it("keeps Google and GitHub optional when ENV_STRICT=true", async () => {
  const strictEnv = {
    ENV_STRICT: "true",
    DATABASE_URL: "postgres://u:p@127.0.0.1:5432/x", BETTER_AUTH_SECRET: "x".repeat(32), BETTER_AUTH_URL: "https://aedoxy.test",
    CONSOLE_OIDC_CLIENT_SECRET: "x", EMAIL_FROM: "x", EMAIL_SERVER_URL: "smtp://x", POKETO_SECRET_KEY: "x", POKETO_WEBHOOK_SECRET: "x",
    NEWAPI_INTERNAL_URL: "http://x.test", NEWAPI_BRIDGE_TOKEN: "x",
  };
  for (const [k, v] of Object.entries(strictEnv)) vi.stubEnv(k, v);
  vi.resetModules();
  try {
    const mod = await import("@/env");
    expect(mod.parseEnv(strictEnv).GITHUB_CLIENT_ID).toBeUndefined();
    expect(() => mod.parseEnv({ ...strictEnv, GITHUB_CLIENT_ID: "only-id" })).toThrow(/together/);
  } finally {
    vi.unstubAllEnvs();
  }
});

describe("EMAIL_SMTP_*", () => {
  it("defaults to starttls and coerces the port", () => {
    const env = parseEnv({ EMAIL_SMTP_HOST: "h", EMAIL_SMTP_PORT: "2525" });
    expect([env.EMAIL_SMTP_TLS, env.EMAIL_SMTP_PORT]).toEqual(["starttls", 2525]);
  });

  it("rejects a bad port or TLS mode", () => {
    for (const port of ["0", "65536", "abc", "25.5"]) expect(() => parseEnv({ EMAIL_SMTP_PORT: port })).toThrow(/EMAIL_SMTP_PORT/);
    expect(() => parseEnv({ EMAIL_SMTP_TLS: "tls" })).toThrow(/EMAIL_SMTP_TLS/);
  });

  it("rejects user without password and vice versa, without echoing values", () => {
    expect(() => parseEnv({ EMAIL_SMTP_USER: "u-secret" })).toThrow(/together/);
    expect(() => parseEnv({ EMAIL_SMTP_PASSWORD: "pw-secret" })).toThrow(/together/);
    expect(() => parseEnv({ EMAIL_SMTP_USER: "u-secret" })).not.toThrow(/u-secret/);
    expect(parseEnv({ EMAIL_SMTP_USER: "u", EMAIL_SMTP_PASSWORD: "p" }).EMAIL_SMTP_PASSWORD).toBe("p");
  });

  // `strict` is fixed when env.ts loads, so reload the module with ENV_STRICT=true.
  it("under ENV_STRICT=true requires host or URL and refuses tls=none", async () => {
    const rest = {
      ENV_STRICT: "true",
      DATABASE_URL: "postgres://u:p@127.0.0.1:5432/x", BETTER_AUTH_SECRET: "x".repeat(32), BETTER_AUTH_URL: "https://aedoxy.test",
      CONSOLE_OIDC_CLIENT_SECRET: "x", EMAIL_FROM: "x", POKETO_SECRET_KEY: "x", POKETO_WEBHOOK_SECRET: "x",
      NEWAPI_INTERNAL_URL: "http://x.test", NEWAPI_BRIDGE_TOKEN: "x",
    };
    // The module parses process.env on import, so give that load a valid configuration.
    for (const [k, v] of Object.entries({ ...rest, EMAIL_SMTP_HOST: "h" })) vi.stubEnv(k, v);
    vi.resetModules();
    try {
      const { parseEnv: strictParse } = await import("@/env");
      expect(() => strictParse(rest)).toThrow(/EMAIL_SMTP_HOST/);
      expect(strictParse({ ...rest, EMAIL_SERVER_URL: "smtp://x" }).EMAIL_SERVER_URL).toBe("smtp://x");
      expect(strictParse({ ...rest, EMAIL_SMTP_HOST: "h", EMAIL_SMTP_USER: "u", EMAIL_SMTP_PASSWORD: "p" }).EMAIL_SMTP_HOST).toBe("h");
      expect(() => strictParse({ ...rest, EMAIL_SMTP_HOST: "h", EMAIL_SMTP_TLS: "none" })).toThrow(/EMAIL_SMTP_TLS/);
      expect(() => strictParse({ ...rest, EMAIL_SMTP_HOST: "h", EMAIL_SMTP_USER: "u" })).toThrow(/together/);
      expect(() => strictParse({ ...rest, EMAIL_FROM: "", EMAIL_SMTP_HOST: "h" })).toThrow(/EMAIL_FROM/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
