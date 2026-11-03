import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";

// `strict` is fixed when env.ts loads, so the ENV_STRICT=true case is checked in a separate process.
describe("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET", () => {
  it("may both be absent or empty", () => {
    expect(parseEnv({}).GOOGLE_CLIENT_ID).toBeUndefined();
    expect(parseEnv({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" }).GOOGLE_CLIENT_SECRET).toBeUndefined();
  });

  it("pass through when both are set", () => {
    const env = parseEnv({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" });
    expect([env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET]).toEqual(["id", "secret"]);
  });

  it("reject a single one without echoing the value", () => {
    expect(() => parseEnv({ GOOGLE_CLIENT_ID: "top-secret-id" })).toThrow(/GOOGLE_CLIENT_ID/);
    expect(() => parseEnv({ GOOGLE_CLIENT_SECRET: "top-secret" })).toThrow(/together/);
    expect(() => parseEnv({ GOOGLE_CLIENT_ID: "top-secret-id" })).not.toThrow(/top-secret-id/);
  });
});
