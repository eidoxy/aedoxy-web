import { describe, expect, it } from "vitest";
import { isValidUsername, RESERVED_USERNAMES, usernameBase, usernameCandidate, usernameProblem } from "./username";

describe("usernameProblem", () => {
  it("accepts lowercase letters, digits and underscore from 3 to 20 characters", () => {
    for (const ok of ["abc", "a_b", "user_01", "a".repeat(20), "007"]) expect(usernameProblem(ok)).toBeNull();
  });

  it("rejects bad length, characters and reserved names", () => {
    expect(usernameProblem("ab")).toBe("length");
    expect(usernameProblem("a".repeat(21))).toBe("length");
    for (const bad of ["Upper", "has space", "dot.name", "dash-name", "é_é_é"]) expect(usernameProblem(bad)).toBe("format");
    for (const name of RESERVED_USERNAMES) expect(usernameProblem(name)).toBe("reserved");
  });

  it("reserves every name the product asked for", () => {
    for (const name of ["admin", "root", "support", "system", "aedoxy", "api", "www", "null", "undefined", "console", "billing", "security", "help"]) {
      expect(isValidUsername(name)).toBe(false);
    }
  });
});

describe("usernameBase", () => {
  it("lowercases and drops characters outside a-z 0-9 _", () => {
    expect(usernameBase("Octo-Cat.99")).toBe("octocat99");
    expect(usernameBase("john.doe+tag")).toBe("johndoetag");
  });

  it("turns accents into plain letters and drops what has no ASCII form", () => {
    expect(usernameBase("Zoë Müller")).toBe("zoemuller");
    expect(usernameBase("山田太郎")).toBe("user");
    expect(usernameBase("😀😀")).toBe("user");
  });

  it("pads names that are too short", () => {
    expect(usernameBase("ab")).toBe("ab_user");
    expect(usernameBase("")).toBe("user");
    expect(usernameBase("--")).toBe("user");
  });

  it("cuts names that are too long to 20 characters", () => {
    expect(usernameBase("a".repeat(50))).toBe("a".repeat(20));
  });

  it("renames reserved names", () => {
    expect(usernameBase("Admin")).toBe("admin_user");
    expect(usernameBase("support")).toBe("support_user");
  });

  it("always returns a valid username", () => {
    for (const raw of ["", "a", "ADMIN", "x".repeat(99), "é", "__", "Zoë", "root", "名前", "a b c"]) expect(isValidUsername(usernameBase(raw))).toBe(true);
  });
});

describe("usernameCandidate", () => {
  it("tries the base first, then adds a numeric suffix of growing length", () => {
    const fixed = () => 0.5;
    expect(usernameCandidate("octocat", 0, fixed)).toBe("octocat");
    expect(usernameCandidate("octocat", 1, fixed)).toBe("octocat50");
    expect(usernameCandidate("octocat", 2, fixed)).toBe("octocat500");
    expect(usernameCandidate("octocat", 9, fixed)).toBe("octocat500000");
  });

  it("zero pads the suffix", () => {
    expect(usernameCandidate("octocat", 1, () => 0)).toBe("octocat00");
  });

  it("stays valid and within 20 characters when the base is already 20 long", () => {
    const base = "a".repeat(20);
    for (let attempt = 0; attempt < 12; attempt++) {
      const c = usernameCandidate(base, attempt, Math.random);
      expect(c.length).toBeLessThanOrEqual(20);
      expect(isValidUsername(c)).toBe(true);
    }
    expect(usernameCandidate(base, 1, () => 0.123)).toBe("a".repeat(18) + "12");
  });
});
