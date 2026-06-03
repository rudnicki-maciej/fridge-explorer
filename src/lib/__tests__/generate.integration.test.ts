import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { generateMealPlan } from "@/lib/generate";
import type { UserSettings, Supplies } from "@/types";

vi.mock("@/lib/metrics", () => ({
  recordGeneration: vi.fn().mockResolvedValue(undefined),
}));

const supplies: Supplies = {
  "Chicken Breast": { amount: 500, unit: "g" },
  Rice: { amount: 300, unit: "g" },
  Broccoli: { amount: 200, unit: "g" },
};

const settings: UserSettings = {
  dailyCalorieTarget: 2000, // mainCalories = 1600, cap = 1760
  disallowList: ["peanut"],
};

function makeOpenAIResponse(content: object) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 100, completion_tokens: 200 },
    }),
  };
}

function validMealSetPayload(overrides: Partial<{ totalCalories: number; ingredientName: string }> = {}) {
  const name = overrides.ingredientName ?? "Chicken Breast";
  return {
    mealSets: [
      {
        id: "set-1",
        breakfast: { name: "B", description: "b", calories: 400, ingredients: [{ name, amount: 100, unit: "g" }], category: "breakfast" },
        lunch: { name: "L", description: "l", calories: 600, ingredients: [{ name, amount: 100, unit: "g" }], category: "lunch" },
        dinner: { name: "D", description: "d", calories: 600, ingredients: [{ name, amount: 100, unit: "g" }], category: "dinner" },
        totalCalories: overrides.totalCalories ?? 1600,
      },
    ],
    snacks: [
      { name: "S", description: "s", calories: 200, ingredients: [{ name, amount: 50, unit: "g" }] },
    ],
  };
}

describe("generateMealPlan integration", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.OPENAI_API_KEY;
  });

  test(`returns null when LLM response contains disallowed ingredient`, async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeOpenAIResponse(validMealSetPayload({ ingredientName: "Peanut Butter" })),
    ) as unknown as typeof fetch;

    const result = await generateMealPlan(settings, supplies);

    expect(result).toBeNull();
  });

  test(`returns null when totalCalories exceeds target × 1.10`, async () => {
    // cap = 1760, so 1761 should fail
    global.fetch = vi.fn().mockResolvedValue(
      makeOpenAIResponse(validMealSetPayload({ totalCalories: 1761 })),
    ) as unknown as typeof fetch;

    const result = await generateMealPlan(settings, supplies);

    expect(result).toBeNull();
  });

  test(`returns parsed result when all constraints pass`, async () => {
    global.fetch = vi.fn().mockResolvedValue(
      makeOpenAIResponse(validMealSetPayload()),
    ) as unknown as typeof fetch;

    const result = await generateMealPlan(settings, supplies);

    expect(result).not.toBeNull();
    expect(result!.mealSets).toHaveLength(1);
    expect(result!.snacks).toHaveLength(1);
  });

  test(`returns null on structural validation failure (malformed ingredients)`, async () => {
    const payload = {
      mealSets: [
        {
          id: "set-1",
          breakfast: { name: "B", description: "b", calories: 400, ingredients: [{ name: "X", amount: -1, unit: "g" }], category: "breakfast" },
          lunch: { name: "L", description: "l", calories: 600, ingredients: [{ name: "Y", amount: 100, unit: "g" }], category: "lunch" },
          dinner: { name: "D", description: "d", calories: 600, ingredients: [{ name: "Z", amount: 100, unit: "g" }], category: "dinner" },
          totalCalories: 1600,
        },
      ],
      snacks: [],
    };
    global.fetch = vi.fn().mockResolvedValue(
      makeOpenAIResponse(payload),
    ) as unknown as typeof fetch;

    const result = await generateMealPlan(settings, supplies);

    expect(result).toBeNull();
  });
});
