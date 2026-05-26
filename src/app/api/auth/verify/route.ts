import { NextRequest, NextResponse } from "next/server";
import { verifyMagicToken, createSessionToken, setSessionCookie } from "@/lib/auth";
import { getUser, createUser } from "@/lib/kv";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/login?error=expired", request.url));
  }

  const email = await verifyMagicToken(token);
  if (!email) {
    return NextResponse.redirect(new URL("/login?error=expired", request.url));
  }

  const user = await getUser(email);
  if (!user) {
    await createUser(email);
  }

  const sessionToken = await createSessionToken(email);
  await setSessionCookie(sessionToken);

  return NextResponse.redirect(new URL("/plan", request.url));
}
