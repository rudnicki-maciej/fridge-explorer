import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { parseSuppliesText } from "@/lib/supplies-parser";

export async function POST(request: Request) {
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

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { text } = body as Record<string, unknown>;
  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  if (text.length > 500) {
    return NextResponse.json({ error: "Text too long (max 500 characters)" }, { status: 400 });
  }

  const sanitized = text.replace(/[\n\r]/g, " ").trim();
  const { existingItems } = body as Record<string, unknown>;
  const existing = Array.isArray(existingItems) ? existingItems.filter((i): i is string => typeof i === "string") : undefined;
  const items = await parseSuppliesText(sanitized, existing);

  if (!items) {
    return NextResponse.json(
      { error: "Failed to parse supplies" },
      { status: 502 },
    );
  }

  return NextResponse.json({ items });
}
