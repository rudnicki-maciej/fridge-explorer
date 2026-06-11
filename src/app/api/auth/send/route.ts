import { NextResponse } from "next/server";
import { generateMagicToken, storeMagicToken, isTestAccount, isSeedAccount, createSessionToken, setSessionCookie } from "@/lib/auth";
import { sendMagicLinkEmail } from "@/lib/email";
import { getUser, createUser, setUser, type UserData } from "@/lib/kv";

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

    if (isTestAccount(normalized)) {
      if (isSeedAccount(normalized)) {
        const freshData: UserData = {
          settings: { dailyCalorieTarget: 2000, disallowList: [] },
          supplies: {},
          pregenerated: null,
          updatedAt: new Date().toISOString(),
        };
        await setUser(normalized, freshData);
      } else if (!(await getUser(normalized))) {
        await createUser(normalized);
      }
      const token = await createSessionToken(normalized);
      await setSessionCookie(token);
      return NextResponse.json({ ok: true, token, testAccount: true });
    }

    const magicToken = generateMagicToken();
    await storeMagicToken(normalized, magicToken);
    await sendMagicLinkEmail(normalized, magicToken);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Magic link send failed:", error);
    return NextResponse.json({ error: "Failed to send login link" }, { status: 500 });
  }
}
