import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getUser, setUser } from "@/lib/kv";
import type { Supplies } from "@/types";

const VALID_UNITS = ["g", "ml", "items"] as const;

function validateSupplies(body: unknown): Supplies | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const entries = Object.entries(body as Record<string, unknown>);
  if (entries.length === 0) return {};
  if (entries.length > 200) return null;

  const validated: Supplies = {};
  for (const [key, value] of entries) {
    const name = key.replace(/[\n\r]/g, " ").trim().slice(0, 50);
    if (name.length === 0) return null;

    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }

    const item = value as Record<string, unknown>;
    if (typeof item.amount !== "number" || item.amount <= 0) return null;
    if (!VALID_UNITS.includes(item.unit as typeof VALID_UNITS[number])) return null;

    validated[name] = { amount: item.amount, unit: item.unit as typeof VALID_UNITS[number] };
  }

  return validated;
}

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

  const validated = validateSupplies(body);
  if (validated === null) {
    return NextResponse.json(
      { error: "Invalid supplies. Each item must have a name (≤50 chars), amount (>0), and unit (g, ml, or items)." },
      { status: 400 },
    );
  }

  const user = await getUser(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  user.supplies = validated;
  user.updatedAt = new Date().toISOString();
  await setUser(email, user);

  return NextResponse.json({ ok: true });
}
