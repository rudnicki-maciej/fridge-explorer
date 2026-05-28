import type { UserSettings, Supplies, MealSet, Snack, Ingredient, SupplyUnit } from "@/types";
import { recordGeneration } from "@/lib/metrics";

export function computeInputHash(settings: UserSettings, supplies: Supplies): string {
  const input = JSON.stringify({ settings, supplies });
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }

  return Math.abs(hash).toString(36);
}

function sanitizeName(s: string): string {
  return s.replace(/[\n\r]/g, " ").trim().slice(0, 50);
}

function formatSupplies(supplies: Supplies): string {
  return Object.entries(supplies)
    .map(([name, { amount, unit }]) => `${sanitizeName(name)}: ${amount}${unit}`)
    .join(", ");
}

const VALID_UNITS: SupplyUnit[] = ["g", "ml", "items"];

function validateIngredients(ingredients: unknown): Ingredient[] | null {
  if (!Array.isArray(ingredients)) return null;
  const valid = ingredients.every(
    (i: unknown) => {
      if (typeof i !== "object" || i === null) return false;
      const obj = i as Record<string, unknown>;

      return (
        typeof obj.name === "string" &&
        typeof obj.amount === "number" &&
        obj.amount > 0 &&
        VALID_UNITS.includes(obj.unit as SupplyUnit)
      );
    },
  );

  return valid ? (ingredients as Ingredient[]) : null;
}

export async function generateMealPlan(
  settings: UserSettings,
  supplies: Supplies,
  email?: string,
): Promise<{ mealSets: MealSet[]; snacks: Snack[] } | null> {
  if (Object.keys(supplies).length === 0) return null;

  const supplyListing = formatSupplies(supplies);

  const sanitizedDisallow = settings.disallowList
    .map((s) => sanitizeName(s))
    .filter((s) => s.length > 0);

  const mainCalories = settings.dailyCalorieTarget - 400;

  const prompt = `You are a meal planning assistant. Generate exactly 3 coordinated full-day meal sets.

CONSTRAINTS:
- Available supplies: ${supplyListing}
- NEVER include these foods: ${sanitizedDisallow.length > 0 ? sanitizedDisallow.join(", ") : "none"}
- Each meal set must total approximately ${mainCalories} kcal across breakfast + lunch + dinner
- Maximize variety across food groups between the 3 meals in each set
- Only use ingredients whose names EXACTLY match the available supply item names
- Do not exceed available quantities across all 3 meal sets combined
- Each ingredient entry must specify the exact amount used from supplies

Also suggest 4 snack options (each ~200 kcal) from available supplies.

Respond ONLY with valid JSON matching this schema:
{
  "mealSets": [
    {
      "id": "set-1",
      "breakfast": { "name": "...", "description": "...", "calories": 400, "ingredients": [{ "name": "...", "amount": 200, "unit": "g" }], "category": "breakfast" },
      "lunch": { "name": "...", "description": "...", "calories": 600, "ingredients": [{ "name": "...", "amount": 200, "unit": "g" }], "category": "lunch" },
      "dinner": { "name": "...", "description": "...", "calories": 600, "ingredients": [{ "name": "...", "amount": 200, "unit": "g" }], "category": "dinner" },
      "totalCalories": 1600
    }
  ],
  "snacks": [
    { "name": "...", "description": "...", "calories": 200, "ingredients": [{ "name": "...", "amount": 100, "unit": "g" }] }
  ]
}`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
    const start = Date.now();
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const latencyMs = Date.now() - start;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { mealSets: MealSet[]; snacks: Snack[] };
    if (!parsed.mealSets?.length) return null;

    for (const set of parsed.mealSets) {
      for (const meal of [set.breakfast, set.lunch, set.dinner]) {
        if (!validateIngredients(meal.ingredients)) return null;
      }
    }
    for (const snack of parsed.snacks ?? []) {
      if (!validateIngredients(snack.ingredients)) return null;
    }

    if (email) {
      recordGeneration(email, latencyMs, {
        prompt: data.usage?.prompt_tokens ?? 0,
        completion: data.usage?.completion_tokens ?? 0,
      }).catch(() => {});
    }

    return parsed;
  } catch {
    return null;
  }
}
