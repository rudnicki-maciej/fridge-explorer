import type { UserSettings, Supplies, MealSet, Snack } from "@/types";

export function computeInputHash(settings: UserSettings, supplies: Supplies): string {
  const input = JSON.stringify({ settings, supplies });
  // Simple hash for cache invalidation
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

export async function generateMealPlan(
  settings: UserSettings,
  supplies: Supplies
): Promise<{ mealSets: MealSet[]; snacks: Snack[] } | null> {
  const stocked = Object.entries(supplies)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (stocked.length === 0) return null;

  const mainCalories = settings.dailyCalorieTarget - 400;

  const prompt = `You are a meal planning assistant. Generate exactly 3 coordinated full-day meal sets.

CONSTRAINTS:
- Available food categories: ${stocked.join(", ")}
- NEVER include these foods: ${settings.disallowList.length > 0 ? settings.disallowList.join(", ") : "none"}
- Each meal set must total approximately ${mainCalories} kcal across breakfast + lunch + dinner
- Maximize variety across food groups between the 3 meals in each set
- Only use ingredients from the available categories

Also suggest 4 snack options (each ~200 kcal) from available supplies.

Respond ONLY with valid JSON matching this schema:
{
  "mealSets": [
    {
      "id": "set-1",
      "breakfast": { "name": "...", "description": "...", "calories": 400, "ingredients": ["..."], "category": "breakfast" },
      "lunch": { "name": "...", "description": "...", "calories": 600, "ingredients": ["..."], "category": "lunch" },
      "dinner": { "name": "...", "description": "...", "calories": 600, "ingredients": ["..."], "category": "dinner" },
      "totalCalories": 1600
    }
  ],
  "snacks": [
    { "name": "...", "description": "...", "calories": 200, "ingredients": ["..."] }
  ]
}`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  try {
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
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content) as { mealSets: MealSet[]; snacks: Snack[] };
    if (!parsed.mealSets?.length) return null;

    return parsed;
  } catch {
    return null;
  }
}
