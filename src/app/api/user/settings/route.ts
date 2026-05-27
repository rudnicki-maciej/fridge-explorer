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

  const settings = (await request.json()) as UserSettings;
  const user = await getUser(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  user.settings = settings;
  user.updatedAt = new Date().toISOString();
  await setUser(email, user);

  return NextResponse.json({ ok: true });
}
