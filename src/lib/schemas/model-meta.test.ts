import { describe, expect, it } from "vitest";
import { parseModelMetaForm } from "./model-meta";

const base = { modelName: " gpt-5 ", provider: "OpenAI", contextIn: "400000", contextOut: "128000", cap_text: "on", cap_image: "on", officialInputUsdPerM: "1,25", officialOutputUsdPerM: "10", visible: "on" };

describe("parseModelMetaForm", () => {
  it("parses a full form", () => {
    const r = parseModelMetaForm(base);
    expect(r.success && r.data).toEqual({
      modelName: "gpt-5",
      provider: "OpenAI",
      contextIn: 400_000,
      contextOut: 128_000,
      capabilities: ["text", "image"],
      officialInputUsdPerM: "1.25",
      officialOutputUsdPerM: "10",
      visible: true,
    });
  });

  it("accepts empty optional fields and a hidden model", () => {
    const r = parseModelMetaForm({ modelName: "x", provider: "p" });
    expect(r.success && r.data).toMatchObject({ contextIn: null, officialInputUsdPerM: null, officialOutputUsdPerM: null, capabilities: [], visible: false });
  });

  it("rejects bad numbers, a missing name, and a lone official price", () => {
    expect(parseModelMetaForm({ ...base, modelName: "" }).success).toBe(false);
    expect(parseModelMetaForm({ ...base, contextIn: "12a" }).success).toBe(false);
    expect(parseModelMetaForm({ ...base, contextIn: "999999999999" }).success).toBe(false);
    expect(parseModelMetaForm({ ...base, officialInputUsdPerM: "-1" }).success).toBe(false);
    expect(parseModelMetaForm({ ...base, officialInputUsdPerM: "1.23456" }).success).toBe(false);
    expect(parseModelMetaForm({ ...base, officialOutputUsdPerM: "" }).success).toBe(false);
  });
});
