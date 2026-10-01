import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/api-guard";
import { withApiSpan } from "@/lib/api-telemetry";
import { SqlGuardError, runReadOnlySql } from "@/lib/sql-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return withApiSpan("/api/sql/execute", req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  let body: { query?: unknown; database?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { query, database } = body;
  if (database !== "clickhouse" && database !== "postgres") {
    return NextResponse.json({ error: 'database must be "clickhouse" or "postgres"' }, { status: 400 });
  }
  if (typeof query !== "string" || !query.trim()) {
    return NextResponse.json({ error: "Empty query" }, { status: 400 });
  }

  const startMs = Date.now();
  try {
    const result = await runReadOnlySql(query, database);
    return NextResponse.json({ ...result, durationMs: Date.now() - startMs });
  } catch (err) {
    if (err instanceof SqlGuardError) {
      return NextResponse.json({ error: `Read-only notebook: ${err.message}` }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
