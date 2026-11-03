import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/env";

const mockEnv = vi.hoisted(() => ({ NODE_ENV: "development", EMAIL_SERVER_URL: undefined, EMAIL_FROM: undefined, EMAIL_DEV_OUTBOX: undefined }) as Record<string, string | undefined>);
vi.mock("@/env", async (orig) => ({ ...(await orig<typeof import("@/env")>()), env: mockEnv }));
const smtp = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.createTransport } }));

import { sendEmail } from "@/server/email";

beforeEach(() => {
  Object.assign(mockEnv, { NODE_ENV: "development", EMAIL_SERVER_URL: undefined, EMAIL_FROM: undefined, EMAIL_DEV_OUTBOX: undefined });
  vi.restoreAllMocks();
  smtp.sendMail.mockReset();
  smtp.createTransport.mockClear();
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

describe("SMTP via EMAIL_SERVER_URL", () => {
  const url = "smtp://user:pass@sandbox.smtp.mailtrap.io:2525";
  const msg = { to: "a@x.co", subject: "s", text: "https://x/verify?token=abc" };
  const spies = () => [vi.spyOn(console, "info"), vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];

  it("sends with from/to/subject/text and reuses one transport", async () => {
    Object.assign(mockEnv, { EMAIL_SERVER_URL: url, EMAIL_FROM: "Aedoxy <no-reply@aedoxy.com>" });
    const logs = spies();
    await sendEmail(msg);
    await sendEmail({ ...msg, to: "b@x.co" });
    expect(smtp.createTransport).toHaveBeenCalledTimes(1);
    expect(smtp.createTransport).toHaveBeenCalledWith({ url, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 });
    expect(smtp.sendMail).toHaveBeenNthCalledWith(1, { from: "Aedoxy <no-reply@aedoxy.com>", ...msg });
    expect(smtp.sendMail).toHaveBeenNthCalledWith(2, { from: "Aedoxy <no-reply@aedoxy.com>", ...msg, to: "b@x.co" });
    for (const l of logs) expect(l).not.toHaveBeenCalled();
  });

  it("requires EMAIL_FROM", async () => {
    mockEnv.EMAIL_SERVER_URL = url;
    await expect(sendEmail(msg)).rejects.toThrow(/EMAIL_FROM/);
    expect(smtp.sendMail).not.toHaveBeenCalled();
  });

  it("raises SMTP failures without leaking the recipient or URL", async () => {
    Object.assign(mockEnv, { EMAIL_SERVER_URL: url, EMAIL_FROM: "n@aedoxy.com" });
    smtp.sendMail.mockRejectedValue(Object.assign(new Error("recipient a@x.co rejected by user:pass"), { code: "EENVELOPE" }));
    const logs = spies();
    const err = await sendEmail(msg).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("SMTP send failed (EENVELOPE)");
    for (const l of logs) expect(l).not.toHaveBeenCalled();
  });
});
