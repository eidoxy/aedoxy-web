import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseEnv } from "@/env";

const defaults = vi.hoisted(() => ({ NODE_ENV: "development", EMAIL_SERVER_URL: undefined, EMAIL_FROM: undefined, EMAIL_DEV_OUTBOX: undefined, EMAIL_SMTP_HOST: undefined, EMAIL_SMTP_PORT: undefined, EMAIL_SMTP_USER: undefined, EMAIL_SMTP_PASSWORD: undefined, EMAIL_SMTP_TLS: "starttls" }) as Record<string, string | number | undefined>);
const mockEnv = vi.hoisted(() => ({ ...defaults }));
vi.mock("@/env", async (orig) => ({ ...(await orig<typeof import("@/env")>()), env: mockEnv }));
const smtp = vi.hoisted(() => {
  const sendMail = vi.fn();
  return { sendMail, createTransport: vi.fn((...args: unknown[]) => ({ sendMail, args })) };
});
vi.mock("nodemailer", () => ({ default: { createTransport: smtp.createTransport } }));

import { sendEmail } from "@/server/email";

beforeEach(() => {
  Object.assign(mockEnv, defaults);
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

describe("SMTP via EMAIL_SMTP_* fields", () => {
  const msg = { to: "a@x.co", subject: "s", text: "t" };
  const timeouts = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 };
  const base = { EMAIL_FROM: "n@aedoxy.com", EMAIL_SMTP_HOST: "live.smtp.mailtrap.io" };

  it("starttls: port 587, TLS required, auth when user and password are set", async () => {
    Object.assign(mockEnv, base, { EMAIL_SMTP_USER: "api", EMAIL_SMTP_PASSWORD: "tok" });
    await sendEmail(msg);
    expect(smtp.createTransport).toHaveBeenCalledWith({
      host: "live.smtp.mailtrap.io", port: 587, secure: false, requireTLS: true, auth: { user: "api", pass: "tok" }, ...timeouts,
    });
  });

  it("ssl: implicit TLS on 465, explicit port wins", async () => {
    Object.assign(mockEnv, base, { EMAIL_SMTP_TLS: "ssl" });
    await sendEmail(msg);
    expect(smtp.createTransport).toHaveBeenLastCalledWith({ host: base.EMAIL_SMTP_HOST, port: 465, secure: true, requireTLS: false, ...timeouts });
    mockEnv.EMAIL_SMTP_PORT = 2465;
    await sendEmail(msg);
    expect(smtp.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 2465, secure: true }));
  });

  it("none: no TLS and no auth key when credentials are missing", async () => {
    Object.assign(mockEnv, base, { EMAIL_SMTP_TLS: "none", EMAIL_SMTP_PORT: 1025 });
    await sendEmail(msg);
    const opts = smtp.createTransport.mock.calls.at(-1)![0] as Record<string, unknown>;
    expect(opts).toEqual({ host: base.EMAIL_SMTP_HOST, port: 1025, secure: false, requireTLS: false, ...timeouts });
    expect("auth" in opts).toBe(false);
  });

  it("wins over EMAIL_SERVER_URL", async () => {
    Object.assign(mockEnv, base, { EMAIL_SERVER_URL: "smtp://u:p@other.example:25" });
    await sendEmail(msg);
    expect(smtp.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ host: base.EMAIL_SMTP_HOST }));
    expect(smtp.createTransport).not.toHaveBeenLastCalledWith(expect.objectContaining({ url: expect.anything() }));
  });

  it("builds a new transport when the configuration changes", async () => {
    Object.assign(mockEnv, base, { EMAIL_SMTP_HOST: "cache-test.example" }); // unique host: the module cache outlives tests
    await sendEmail(msg);
    await sendEmail(msg);
    expect(smtp.createTransport).toHaveBeenCalledTimes(1);
    mockEnv.EMAIL_SMTP_PORT = 2525;
    await sendEmail(msg);
    expect(smtp.createTransport).toHaveBeenCalledTimes(2);
  });

  it("reports code and SMTP response code without host, credentials or recipient", async () => {
    Object.assign(mockEnv, base, { EMAIL_SMTP_USER: "api", EMAIL_SMTP_PASSWORD: "s3cret-tok" });
    smtp.sendMail.mockRejectedValue(Object.assign(new Error("535 auth failed for api s3cret-tok at live.smtp.mailtrap.io to a@x.co"), { code: "EAUTH", responseCode: 535 }));
    const err = (await sendEmail(msg).catch((e: Error) => e)) as Error;
    expect(err.message).toBe("SMTP send failed (EAUTH 535)");
    smtp.sendMail.mockRejectedValue(Object.assign(new Error("x"), { code: "ECONNECTION" }));
    expect(((await sendEmail(msg).catch((e: Error) => e)) as Error).message).toBe("SMTP send failed (ECONNECTION)");
  });

  it("production error names both configuration ways", async () => {
    mockEnv.NODE_ENV = "production";
    await expect(sendEmail(msg)).rejects.toThrow(/EMAIL_SMTP_HOST.*EMAIL_SERVER_URL/);
  });
});
