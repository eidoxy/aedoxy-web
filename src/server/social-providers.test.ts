import { describe, expect, it } from "vitest";
import { configuredSocialProviders, effectiveSocialProviders } from "./social-providers";

const both = { GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "gs", GITHUB_CLIENT_ID: "h", GITHUB_CLIENT_SECRET: "hs" };

describe("configuredSocialProviders", () => {
  it("lists providers whose id and secret are both set", () => {
    expect(configuredSocialProviders(both)).toEqual(["google", "github"]);
    expect(configuredSocialProviders({ ...both, GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined })).toEqual(["github"]);
    expect(configuredSocialProviders({ ...both, GITHUB_CLIENT_SECRET: undefined })).toEqual(["google"]);
    expect(configuredSocialProviders({})).toEqual([]);
  });
});

describe("effectiveSocialProviders (env x switch)", () => {
  const cases: [string, ("google" | "github")[], boolean, boolean, string[]][] = [
    ["both configured, both on", ["google", "github"], true, true, ["google", "github"]],
    ["both configured, github off", ["google", "github"], true, false, ["google"]],
    ["both configured, google off", ["google", "github"], false, true, ["github"]],
    ["both configured, both off", ["google", "github"], false, false, []],
    ["only github configured, both on", ["github"], true, true, ["github"]],
    ["only github configured, github off", ["github"], true, false, []],
    ["nothing configured, both on", [], true, true, []],
  ];
  it.each(cases)("%s", (_name, configured, googleLoginEnabled, githubLoginEnabled, expected) => {
    expect(effectiveSocialProviders(configured, { googleLoginEnabled, githubLoginEnabled })).toEqual(expected);
  });
});
