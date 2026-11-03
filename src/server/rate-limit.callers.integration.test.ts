import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Callers that are not covered by their own integration tests: trust-device throttle and the admin password re-check.
const mocks = vi.hoisted(() => ({ userId: "u-trust", setSessionTrust: vi.fn(async () => ({})) }));
vi.mock("@/server/session", () => ({ requireSession: async () => ({ user: { id: mocks.userId } }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ updateTag: () => undefined }));
vi.mock("@/server/auth", () => ({
  auth: {
    api: { setSessionTrust: mocks.setSessionTrust },
    $context: Promise.resolve({ internalAdapter: { findCredentialAccount: async () => null } }),
  },
}));

import { saveSessionTrustAction } from "@/app/(panel)/settings/actions";
import { db, pool as pgPool } from "@/server/db/client";
import { confirmPassword } from "@/server/admin-security";
import { prepareDatabase, resetDatabase } from "@/server/test/helpers";

beforeAll(prepareDatabase);
afterAll(() => pgPool.end());
beforeEach(async () => {
  await resetDatabase();
  mocks.setSessionTrust.mockClear();
});

const trustForm = () => {
  const fd = new FormData();
  fd.set("trusted", "on");
  return fd;
};

describe("saveSessionTrustAction", () => {
  it("allows 5 changes per minute per user, then refuses without calling Better Auth", async () => {
    for (let i = 0; i < 5; i++) expect(await saveSessionTrustAction({}, trustForm())).toMatchObject({ ok: expect.any(String) });
    expect(await saveSessionTrustAction({}, trustForm())).toEqual({ error: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi." });
    expect(mocks.setSessionTrust).toHaveBeenCalledTimes(5);
    mocks.userId = "u-other";
    expect(await saveSessionTrustAction({}, trustForm())).toMatchObject({ ok: expect.any(String) });
    mocks.userId = "u-trust";
  });

  it("fails closed when the limiter store is down", async () => {
    const exec = vi.spyOn(db, "execute").mockRejectedValue(new Error("connection refused"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await saveSessionTrustAction({}, trustForm())).toMatchObject({ error: expect.stringMatching(/Terlalu banyak percobaan/) });
      expect(mocks.setSessionTrust).not.toHaveBeenCalled();
    } finally {
      exec.mockRestore();
      quiet.mockRestore();
    }
  });
});

describe("confirmPassword", () => {
  it("counts every attempt: the 11th within 5 minutes is refused, and fails closed when the store is down", async () => {
    for (let i = 0; i < 10; i++) await expect(confirmPassword("admin-1", "x")).rejects.toMatchObject({ code: "NO_PASSWORD" });
    await expect(confirmPassword("admin-1", "x")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(confirmPassword("admin-2", "x")).rejects.toMatchObject({ code: "NO_PASSWORD" });

    const exec = vi.spyOn(db, "execute").mockRejectedValue(new Error("connection refused"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(confirmPassword("admin-3", "x")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    } finally {
      exec.mockRestore();
      quiet.mockRestore();
    }
  });
});
