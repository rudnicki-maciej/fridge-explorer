import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getUser, setUser } from "@/lib/kv";
import type { UserSettings } from "@/types";

export async function PUT(request: Request) {
  const userId = await verifySession();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = (await request.json()) as UserSettings;
  const user = await getUser(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  user.settings = settings;
  user.updatedAt = new Date().toISOString();
  await setUser(userId, user);

  return NextResponse.json({ ok: true });
}
