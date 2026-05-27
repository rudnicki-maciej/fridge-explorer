import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getUser, setUser } from "@/lib/kv";
import type { Supplies } from "@/types";

export async function GET() {
  const email = await verifySession();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUser(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(user.supplies);
}

export async function PUT(request: Request) {
  const email = await verifySession();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supplies = (await request.json()) as Supplies;
  const user = await getUser(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  user.supplies = supplies;
  user.updatedAt = new Date().toISOString();
  await setUser(email, user);

  return NextResponse.json({ ok: true });
}
