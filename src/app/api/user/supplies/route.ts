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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !Object.values(body as Record<string, unknown>).every((v) => typeof v === "boolean")
  ) {
    return NextResponse.json({ error: "Invalid supplies" }, { status: 400 });
  }

  const validated = body as Supplies;
  const user = await getUser(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  user.supplies = validated;
  user.updatedAt = new Date().toISOString();
  await setUser(email, user);

  return NextResponse.json({ ok: true });
}
