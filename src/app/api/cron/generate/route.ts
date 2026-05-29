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

  const BATCH_SIZE = 5;
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batch = userIds.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (userId) => {
      try {
        const user = await getUser(userId);
        if (!user) return;

        const stocked = Object.keys(user.supplies).length > 0;
        if (!stocked) {
          skipped++;
          return;
        }

        const hash = computeInputHash(user.settings, user.supplies);

        if (
          user.pregenerated?.date === targetDate &&
          user.pregenerated?.inputHash === hash
        ) {
          skipped++;
          return;
        }

        const result = await generateMealPlan(user.settings, user.supplies, userId);
        if (result) {
          user.pregenerated = { date: targetDate, inputHash: hash, ...result };
          await setUser(userId, user);
          generated++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }));
  }

  return NextResponse.json({ generated, skipped, failed, total: userIds.length });
}
