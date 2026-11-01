import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/env";

const mockEnv = vi.hoisted(() => ({ NODE_ENV: "development", EMAIL_SERVER_URL: undefined, EMAIL_DEV_OUTBOX: undefined }) as Record<string, string | undefined>);
vi.mock("@/env", async (orig) => ({ ...(await orig<typeof import("@/env")>()), env: mockEnv }));

import { sendEmail } from "@/server/email";

beforeEach(() => {
  Object.assign(mockEnv, { NODE_ENV: "development", EMAIL_SERVER_URL: undefined, EMAIL_DEV_OUTBOX: undefined });
});

describe("EMAIL_DEV_OUTBOX", () => {
  it("appends one JSON line per message, creating directories", async () => {
    const file = join(await mkdtemp(join(tmpdir(), "outbox-")), "nested", "mail.jsonl");
    mockEnv.EMAIL_DEV_OUTBOX = file;
    await sendEmail({ to: "a@x.co", subject: "one", text: "link-1" });
    await sendEmail({ to: "b@x.co", subject: "two", text: "link-2" });
    const lines = (await readFile(file, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ to: "a@x.co", subject: "one", text: "link-1" });
    expect(Number.isNaN(Date.parse(lines[0].ts))).toBe(false);
    expect(lines[1]).toMatchObject({ to: "b@x.co", subject: "two", text: "link-2" });
  });

  it("is refused when ENV_STRICT=true", () => {
    expect(() => parseEnv({ ENV_STRICT: "true", EMAIL_DEV_OUTBOX: "/tmp/mail.jsonl" })).toThrow(/EMAIL_DEV_OUTBOX/);
  });

  it("must be an absolute path", () => {
    expect(() => parseEnv({ EMAIL_DEV_OUTBOX: "mail.jsonl" })).toThrow(/absolute/);
  });
});

describe("without outbox", () => {
  it("prints to the console in development", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    await sendEmail({ to: "a@x.co", subject: "s", text: "t" });
    expect(info).toHaveBeenCalledWith("[email:dev] to=a@x.co subject=s\nt\n");
  });

  it("throws in production", async () => {
    mockEnv.NODE_ENV = "production";
    await expect(sendEmail({ to: "a@x.co", subject: "s", text: "t" })).rejects.toThrow(/not configured/);
  });
});
