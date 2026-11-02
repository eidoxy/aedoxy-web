import { describe, expect, it } from "vitest";
import { csvRow, csvText } from "./csv";

describe("csvText", () => {
  it.each(["=SUM(A1)", "+1+1", "-2+3", "@cmd", "\t=1", "\r=1"])("neutralises a formula start: %j", (v) => {
    expect(csvText(v).replace(/^"/, "").startsWith("'")).toBe(true);
  });

  it("leaves ordinary text alone", () => {
    expect(csvText("restock Oktober")).toBe("restock Oktober");
    expect(csvText("a=b")).toBe("a=b");
  });

  it("quotes commas, quotes and line breaks and doubles inner quotes", () => {
    expect(csvText('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvText("a\nb")).toBe('"a\nb"');
  });

  it("escapes and quotes together", () => {
    expect(csvText('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });
});

describe("csvRow", () => {
  it("writes numbers raw (a negative delta stays numeric) and null as empty", () => {
    expect(csvRow([1, -1_250_000, null, "=1+1", undefined])).toBe("1,-1250000,,'=1+1,");
  });
});
