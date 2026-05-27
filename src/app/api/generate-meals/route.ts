import { NextResponse } from "next/server";
import type { GenerateMealsRequest } from "@/types";
import { verifySession } from "@/lib/auth";
import { generateMealPlan } from "@/lib/generate";

export async function POST(request: Request) {
  const email = await verifySession();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as GenerateMealsRequest;
  const { supplies, dailyCalorieTarget, disallowList } = body;

  const stocked = Object.entries(supplies).filter(([, v]) => v);
  if (stocked.length === 0) {
    return NextResponse.json(
      { error: "No supplies selected. Add some ingredients first." },
      { status: 400 }
    );
  }

  const result = await generateMealPlan(
    { dailyCalorieTarget, disallowList },
    supplies,
    email,
  );

  if (!result) {
    return NextResponse.json(
      { error: "Failed to generate meal plan" },
      { status: 502 }
    );
  }

  return NextResponse.json(result);
}
