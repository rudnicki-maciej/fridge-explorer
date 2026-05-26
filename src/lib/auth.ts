import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "crypto";
import { redis } from "@/lib/kv";

const SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-secret-change-in-production"
);
const COOKIE_NAME = "fridge-session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const MAGIC_TOKEN_TTL = 60 * 15; // 15 minutes

export function generateMagicToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function storeMagicToken(email: string, token: string): Promise<void> {
  // Invalidate any previous token for this email
  const previousToken = await redis.get<string>(`magic-email:${email}`);
  if (previousToken) {
    await redis.del(`magic:${previousToken}`);
  }

  // Store new token → email mapping with TTL
  await redis.set(`magic:${token}`, email, { ex: MAGIC_TOKEN_TTL });
  // Store email → token mapping for invalidation
  await redis.set(`magic-email:${email}`, token, { ex: MAGIC_TOKEN_TTL });
}

export async function verifyMagicToken(token: string): Promise<string | null> {
  const key = `magic:${token}`;
  // Atomic get-and-delete to prevent TOCTOU race
  const email = await redis.getdel<string>(key);
  if (!email) return null;

  await redis.del(`magic-email:${email}`);

  return email;
}

export async function createSessionToken(email: string): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(SECRET);
}

export async function verifySession(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return (payload.email as string) ?? null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}
