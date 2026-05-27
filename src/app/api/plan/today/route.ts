import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getUser, setUser } from "@/lib/kv";
import { generateMealPlan, computeInputHash } from "@/lib/generate";

export async function GET() {
  const userId = await verifySession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUser(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const today = new Date().toISOString().split("T")[0];
  const currentHash = computeInputHash(user.settings, user.supplies);

  // Return pre-generated plan if valid
  if (
    user.pregenerated &&
    user.pregenerated.date === today &&
    user.pregenerated.inputHash === currentHash
  ) {
    return NextResponse.json({
      mealSets: user.pregenerated.mealSets,
      snacks: user.pregenerated.snacks,
      pregenerated: true,
    });
  }

  // Fallback: generate on-demand
  const result = await generateMealPlan(user.settings, user.supplies, userId);
  if (!result) {
    return NextResponse.json({ error: "Failed to generate plan" }, { status: 502 });
  }

  // Cache for today
  user.pregenerated = { date: today, inputHash: currentHash, ...result };
  await setUser(userId, user);

  return NextResponse.json({ ...result, pregenerated: false });
}
