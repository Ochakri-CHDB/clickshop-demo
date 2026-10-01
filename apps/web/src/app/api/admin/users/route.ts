import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// This demo has no self-service sign-up: everyone signs in with the
// shared demo password, so there is no verified-user registry to manage.
export async function GET() {
  return NextResponse.json({ users: [] });
}

export async function POST() {
  return NextResponse.json({ ok: true });
}
