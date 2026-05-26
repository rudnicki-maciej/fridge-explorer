import { NextResponse } from "next/server";
import { getAllUserIds, getUser, setUser } from "@/lib/kv";
import { generateMealPlan, computeInputHash } from "@/lib/generate";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIds = await getAllUserIds();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const targetDate = tomorrow.toISOString().split("T")[0];

  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const userId of userIds) {
    const user = await getUser(userId);
    if (!user) continue;

    const stocked = Object.values(user.supplies).some((v) => v);
    if (!stocked) {
      skipped++;
      continue;
    }

    const hash = computeInputHash(user.settings, user.supplies);

    // Skip if already generated for tomorrow with same inputs
    if (
      user.pregenerated?.date === targetDate &&
      user.pregenerated?.inputHash === hash
    ) {
      skipped++;
      continue;
    }

    const result = await generateMealPlan(user.settings, user.supplies);
    if (result) {
      user.pregenerated = { date: targetDate, inputHash: hash, ...result };
      await setUser(userId, user);
      generated++;
    } else {
      failed++;
    }
  }

  return NextResponse.json({ generated, skipped, failed, total: userIds.length });
}
