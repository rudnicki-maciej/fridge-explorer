import { NextResponse } from "next/server";
import { generateMagicToken, storeMagicToken } from "@/lib/auth";
import { sendMagicLinkEmail } from "@/lib/email";

export async function POST(request: Request) {
  const { email } = (await request.json()) as { email?: string };

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const token = generateMagicToken();
  await storeMagicToken(email.toLowerCase(), token);
  await sendMagicLinkEmail(email.toLowerCase(), token);

  return NextResponse.json({ ok: true });
}
