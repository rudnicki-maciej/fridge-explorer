import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { getUser } from "@/lib/kv";

export async function POST(request: Request) {
  const { code } = (await request.json()) as { code?: string };
  if (!code || code.length !== 6) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  const upper = code.toUpperCase();
  const user = await getUser(upper);
  if (!user) {
    return NextResponse.json({ error: "Code not found" }, { status: 404 });
  }

  const token = await createSessionToken(upper);
  await setSessionCookie(token);

  return NextResponse.json({ code: upper });
}
