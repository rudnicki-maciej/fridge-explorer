import { NextResponse } from "next/server";
import { generateUserCode, createSessionToken, setSessionCookie } from "@/lib/auth";
import { createUser, redis } from "@/lib/kv";

export async function POST() {
  // Generate unique code
  let code: string;
  let attempts = 0;
  do {
    code = generateUserCode();
    attempts++;
  } while ((await redis.exists(`user:${code}`)) && attempts < 10);

  if (attempts >= 10) {
    return NextResponse.json({ error: "Failed to generate unique code" }, { status: 500 });
  }

  await createUser(code);
  const token = await createSessionToken(code);
  await setSessionCookie(token);

  return NextResponse.json({ code });
}
