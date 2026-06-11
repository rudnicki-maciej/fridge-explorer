import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { parseSuppliesText } from "@/lib/supplies-parser";
import { mergeItems } from "@/lib/supply-math";
import type { Supplies } from "@/types";

function makeOpenAIResponse(content: object) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
    }),
  };
}

describe("NL supply dedup pipeline (parse → merge)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
  });

  test(`merges into existing supply when LLM returns matching name`, async () => {
    const supplies: Supplies = { "chicken breast": { amount: 300, unit: "g" } };
    global.fetch = vi.fn().mockResolvedValue(
      makeOpenAIResponse({ items: [{ name: "chicken breast", amount: 200, unit: "g" }] }),
    ) as unknown as typeof fetch;

    const parsed = await parseSuppliesText("200g chicken breast", Object.keys(supplies));
    const result = mergeItems(supplies, parsed!);

    expect(result).toEqual({ "chicken breast": { amount: 500, unit: "g" } });
  });

  test(`adds new entry when item does not exist in supplies`, async () => {
    const supplies: Supplies = { rice: { amount: 300, unit: "g" } };
    global.fetch = vi.fn().mockResolvedValue(
      makeOpenAIResponse({ items: [{ name: "salmon", amount: 400, unit: "g" }] }),
    ) as unknown as typeof fetch;

    const parsed = await parseSuppliesText("400g salmon", Object.keys(supplies));
    const result = mergeItems(supplies, parsed!);

    expect(result).toEqual({
      rice: { amount: 300, unit: "g" },
      salmon: { amount: 400, unit: "g" },
    });
  });

  test(`creates duplicate entry when LLM returns non-matching name (known limitation)`, async () => {
    const supplies: Supplies = { "chicken breast": { amount: 300, unit: "g" } };
    global.fetch = vi.fn().mockResolvedValue(
      makeOpenAIResponse({ items: [{ name: "chicken", amount: 200, unit: "g" }] }),
    ) as unknown as typeof fetch;

    const parsed = await parseSuppliesText("200g chicken", Object.keys(supplies));
    const result = mergeItems(supplies, parsed!);

    expect(result["chicken breast"]).toEqual({ amount: 300, unit: "g" });
    expect(result["chicken"]).toEqual({ amount: 200, unit: "g" });
    expect(Object.keys(result)).toHaveLength(2);
  });
});
