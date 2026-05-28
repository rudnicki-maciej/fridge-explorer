import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { generateMealPlan } from "@/lib/generate";

const VALID_UNITS = ["g", "ml", "items"] as const;

export async function POST(request: Request) {
  const email = await verifySession();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { supplies, dailyCalorieTarget, disallowList } = body as Record<string, unknown>;

  if (typeof supplies !== "object" || supplies === null || Array.isArray(supplies)) {
    return NextResponse.json({ error: "Invalid supplies" }, { status: 400 });
  }

  const entries = Object.entries(supplies as Record<string, unknown>);
  if (entries.length === 0) {
    return NextResponse.json(
      { error: "No supplies selected. Add some ingredients first." },
      { status: 400 },
    );
  }

  for (const [, value] of entries) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return NextResponse.json({ error: "Invalid supplies" }, { status: 400 });
    }
    const item = value as Record<string, unknown>;
    if (typeof item.amount !== "number" || item.amount <= 0) {
      return NextResponse.json({ error: "Invalid supplies" }, { status: 400 });
    }
    if (!VALID_UNITS.includes(item.unit as typeof VALID_UNITS[number])) {
      return NextResponse.json({ error: "Invalid supplies" }, { status: 400 });
    }
  }

  if (typeof dailyCalorieTarget !== "number" || dailyCalorieTarget <= 0) {
    return NextResponse.json({ error: "Invalid calorie target" }, { status: 400 });
  }

  if (!Array.isArray(disallowList)) {
    return NextResponse.json({ error: "Invalid disallow list" }, { status: 400 });
  }

  const result = await generateMealPlan(
    { dailyCalorieTarget, disallowList: disallowList as string[] },
    supplies as unknown as import("@/types").Supplies,
    email,
  );

  if (!result) {
    return NextResponse.json(
      { error: "Failed to generate meal plan" },
      { status: 502 },
    );
  }

  return NextResponse.json(result);
}
