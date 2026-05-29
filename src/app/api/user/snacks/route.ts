import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { getUser } from "@/lib/kv";

export async function GET() {
  const email = await verifySession();
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getUser(email);
  const snacks = user?.pregenerated?.snacks ?? [];

  return NextResponse.json({ snacks });
}
