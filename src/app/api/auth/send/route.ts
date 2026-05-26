import { NextResponse } from "next/server";
import { generateMagicToken, storeMagicToken } from "@/lib/auth";
import { sendMagicLinkEmail } from "@/lib/email";

export async function POST(request: Request) {
  let email: string | undefined;
  try {
    ({ email } = (await request.json()) as { email?: string });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase())) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    const normalized = email.toLowerCase();
    const token = generateMagicToken();
    await storeMagicToken(normalized, token);
    await sendMagicLinkEmail(normalized, token);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Magic link send failed:", error);
    return NextResponse.json({ error: "Failed to send login link" }, { status: 500 });
  }
}
