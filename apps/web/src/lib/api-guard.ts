import { timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Session guard for API routes. The middleware matcher excludes /api/*, so
 * every route that reads data or triggers an action must self-guard.
 * Returns a 401 response when the caller is not authenticated, otherwise null.
 *
 * Accepted credentials:
 *  - a NextAuth session cookie (browser users)
 *  - the INTERNAL_API_TOKEN shared secret, sent as `x-internal-token: <token>`
 *    or `Authorization: Bearer <token>` (traffic generator, init job, smoke
 *    tests). Disabled when the env var is unset or shorter than 32 chars.
 *
 * The guard is enforced in every environment. The only bypass is an explicit
 * opt-in for local scripts: NODE_ENV=development and ALLOW_UNAUTHENTICATED_API=1.
 */

function isLocalDevBypass(): boolean {
  return process.env.NODE_ENV === "development" && process.env.ALLOW_UNAUTHENTICATED_API === "1";
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function hasValidServiceToken(): boolean {
  const token = process.env.INTERNAL_API_TOKEN?.trim();
  if (!token || token.length < 32) return false;
  const h = headers();
  const internal = h.get("x-internal-token");
  if (internal) return safeEqual(internal.trim(), token);
  const authorization = h.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return false;
  return safeEqual(authorization.slice(7).trim(), token);
}

export async function getSessionEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email || null;
}

export async function isAuthenticated(): Promise<boolean> {
  if (isLocalDevBypass() || hasValidServiceToken()) return true;
  return (await getSessionEmail()) !== null;
}

export async function requireSession(): Promise<NextResponse | null> {
  if (await isAuthenticated()) return null;
  return NextResponse.json({ error: "Authentication required" }, { status: 401 });
}
