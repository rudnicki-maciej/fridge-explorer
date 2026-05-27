import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getUser, setUser } from "@/lib/kv";
import type { UserSettings } from "@/types";

export async function GET() {
  const email = await verifySession();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUser(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user.settings);
}

export async function PUT(request: Request) {
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

  const settings = body as Record<string, unknown>;
  if (
    typeof settings?.dailyCalorieTarget !== "number" ||
    settings.dailyCalorieTarget <= 0 ||
    !Array.isArray(settings.disallowList) ||
    !settings.disallowList.every((item: unknown) => typeof item === "string")
  ) {
    return NextResponse.json({ error: "Invalid settings" }, { status: 400 });
  }

  const validated: UserSettings = {
    dailyCalorieTarget: settings.dailyCalorieTarget,
    disallowList: settings.disallowList as string[],
  };

  const user = await getUser(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  user.settings = validated;
  user.updatedAt = new Date().toISOString();
  await setUser(email, user);

  return NextResponse.json({ ok: true });
}
