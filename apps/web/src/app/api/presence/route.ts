import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/postgres";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// Lightweight presence tracking for the demo. Each browser tab heartbeats
// every ~30s; a session counts as active if seen within 90s.

const ACTIVE_WINDOW = "90 seconds";

let ensureTablePromise: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = getPool()
      .query(
        `CREATE TABLE IF NOT EXISTS demo_presence (
           session_id TEXT PRIMARY KEY,
           user_label TEXT NOT NULL DEFAULT '',
           last_seen  TIMESTAMPTZ NOT NULL DEFAULT now()
         )`,
      )
      .then(() => undefined)
      .catch((err) => {
        // Allow a retry on the next request instead of caching the failure.
        ensureTablePromise = null;
        throw err;
      });
  }
  return ensureTablePromise;
}

export async function GET() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    await ensureTable();
    const { rows } = await getPool().query(
      `SELECT session_id, user_label, last_seen
         FROM demo_presence
        WHERE last_seen > now() - interval '${ACTIVE_WINDOW}'
        ORDER BY last_seen DESC`,
    );
    return NextResponse.json({ count: rows.length, sessions: rows });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  try {
    const body = (await req.json()) as { sessionId?: string; userLabel?: string };
    const sessionId = typeof body.sessionId === "string" ? body.sessionId.trim() : "";
    const userLabel = typeof body.userLabel === "string" ? body.userLabel.trim().slice(0, 80) : "";

    if (!sessionId || sessionId.length > 64) {
      return NextResponse.json({ error: "sessionId required (max 64 chars)" }, { status: 400 });
    }

    await ensureTable();
    const pool = getPool();
    await pool.query(
      `INSERT INTO demo_presence (session_id, user_label, last_seen)
       VALUES ($1, $2, now())
       ON CONFLICT (session_id)
       DO UPDATE SET user_label = EXCLUDED.user_label, last_seen = now()`,
      [sessionId, userLabel],
    );
    // Opportunistic cleanup so the table never grows unbounded.
    await pool.query(`DELETE FROM demo_presence WHERE last_seen < now() - interval '1 hour'`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
