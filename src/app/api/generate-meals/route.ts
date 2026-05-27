import { NextResponse } from "next/server";
import type { GenerateMealsRequest, GenerateMealsResponse } from "@/types";
import { verifySession } from "@/lib/auth";
import { recordGeneration } from "@/lib/metrics";

export async function POST(request: Request) {
  const email = await verifySession();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as GenerateMealsRequest;
  const { supplies, dailyCalorieTarget, disallowList } = body;

  const stocked = Object.entries(supplies)
    .filter(([, v]) => v)
    .map(([k]) => k);

  if (stocked.length === 0) {
    return NextResponse.json(
      { error: "No supplies selected. Add some ingredients first." },
      { status: 400 }
    );
  }

  const mainCalories = dailyCalorieTarget - 400;

  const prompt = `You are a meal planning assistant. Generate exactly 3 coordinated full-day meal sets.

CONSTRAINTS:
- Available food categories: ${stocked.join(", ")}
- NEVER include these foods: ${disallowList.length > 0 ? disallowList.join(", ") : "none"}
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
  if (!apiKey) {
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 500 }
    );
  }

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

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to generate meal plan" },
        { status: 502 }
      );
    }

    const data = await response.json();
    const latencyMs = Date.now() - start;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Failed to generate meal plan" },
        { status: 502 }
      );
    }

    const parsed = JSON.parse(content) as GenerateMealsResponse;

    // Validate structure
    if (!parsed.mealSets?.length) {
      return NextResponse.json(
        { error: "Invalid meal plan generated" },
        { status: 502 }
      );
    }

    recordGeneration(email, latencyMs, {
      prompt: data.usage?.prompt_tokens ?? 0,
      completion: data.usage?.completion_tokens ?? 0,
    }).catch(() => {});

    return NextResponse.json(parsed);
  } catch (e) {
    return NextResponse.json(
      { error: "Failed to generate meal plan" },
      { status: 500 }
    );
  }
}
