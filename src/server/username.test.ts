import { describe, expect, it } from "vitest";
import { claimUsername, MAX_USERNAME_ATTEMPTS, type ClaimOutcome } from "./username";

/** A fake "table": candidate names in `taken` lose, anything else wins and is recorded. */
function fakeStore(taken: (candidate: string) => boolean) {
  const attempts: string[] = [];
  return {
    attempts,
    attempt: async (candidate: string): Promise<ClaimOutcome> => {
      attempts.push(candidate);
      return taken(candidate) ? "taken" : "assigned";
    },
  };
}

describe("claimUsername", () => {
  it("uses the plain base when it is free", async () => {
    const store = fakeStore(() => false);
    expect(await claimUsername("OctoCat", store.attempt)).toBe("octocat");
    expect(store.attempts).toEqual(["octocat"]);
  });

  it("adds a numeric suffix when the base is taken", async () => {
    const store = fakeStore((c) => c === "octocat");
    const name = await claimUsername("octocat", store.attempt, () => 0.5);
    expect(name).toBe("octocat50");
  });

  it("keeps retrying through repeated collisions, with a longer suffix each time", async () => {
    const store = fakeStore((c) => c.length < "octocat".length + 4);
    const name = await claimUsername("octocat", store.attempt, () => 0.5);
    expect(name).toBe("octocat5000");
    expect(store.attempts).toEqual(["octocat", "octocat50", "octocat500", "octocat5000"]);
  });

  it("gives up with null after the attempt limit instead of looping forever", async () => {
    const store = fakeStore(() => true);
    expect(await claimUsername("octocat", store.attempt)).toBeNull();
    expect(store.attempts).toHaveLength(MAX_USERNAME_ATTEMPTS);
  });

  it("stops when the user no longer needs a username", async () => {
    let calls = 0;
    expect(await claimUsername("octocat", async () => (++calls, "skip"))).toBeNull();
    expect(calls).toBe(1);
  });

  it("never offers a reserved or invalid name", async () => {
    const store = fakeStore(() => false);
    expect(await claimUsername("admin", store.attempt)).toBe("admin_user");
    expect(await claimUsername("山田", store.attempt)).toBe("user");
  });
});
