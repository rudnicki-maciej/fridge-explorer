import { NextResponse } from "next/server";
import { getMetrics } from "@/lib/metrics";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.ADMIN_API_TOKEN}`;

  if (!process.env.ADMIN_API_TOKEN || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const metrics = await getMetrics();

  return NextResponse.json(metrics);
}
