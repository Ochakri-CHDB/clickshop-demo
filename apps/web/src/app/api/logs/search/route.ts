import { NextRequest, NextResponse } from "next/server";
import { getClickHouseClient } from "@/lib/clickhouse";
import { requireSession } from "@/lib/api-guard";
import { withApiSpan } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Full-text search over otel_logs (ClickStack OTel logs).
// Body carries a true full-text index (idx_body_fts, TYPE text with the
// splitByNonAlpha tokenizer, same as customer_feedback). hasAnyTokens
// predicates are evaluated against the inverted index: EXPLAIN indexes=1
// shows granule pruning through idx_body_fts before any data is read.

const RANGE_HOURS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "1d": 24,
  "7d": 168,
};

const SEVERITY_FILTERS: Record<string, string> = {
  all: "",
  error: "AND SeverityText = 'ERROR'",
  warn: "AND SeverityText = 'WARN'",
  info: "AND SeverityText = 'INFO'",
};

const MAX_QUERY_LENGTH = 100;
const MAX_TOKENS = 5;
const MAX_RESULTS = 50;
const MAX_EXECUTION_TIME = 20;

interface LogRow {
  timestamp: string;
  severity: string;
  service: string;
  body: string;
  trace_id: string;
}

function extractTokens(raw: string): string[] {
  // hasToken splits on non-alphanumeric characters, mirror that here.
  const tokens = raw.match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(tokens.filter((t) => t.length >= 2))].slice(0, MAX_TOKENS);
}

export async function POST(req: NextRequest) {
  return withApiSpan("/api/logs/search", req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  let body: { query?: string; severity?: string; range?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawQuery = String(body.query ?? "").slice(0, MAX_QUERY_LENGTH);
  const severity = String(body.severity ?? "all");
  const range = String(body.range ?? "1d");

  const severityClause = SEVERITY_FILTERS[severity];
  if (severityClause === undefined) {
    return NextResponse.json({ error: "severity must be all, error, warn or info" }, { status: 400 });
  }
  const hours = RANGE_HOURS[range];
  if (!hours) {
    return NextResponse.json({ error: "range must be 1h, 6h, 1d or 7d" }, { status: 400 });
  }

  const tokens = extractTokens(rawQuery);
  if (!tokens.length) {
    return NextResponse.json({ error: "Query must contain at least one word (2+ characters)" }, { status: 400 });
  }

  // Tokens are alphanumeric-only (regex above), safe to inline.
  // hasAnyTokens is index-native (Condition "mode: Any" in EXPLAIN) but
  // case-sensitive; match as-typed / lowercase / Capitalized / UPPERCASE
  // variants since log bodies mix all of them. Tokens are ANDed together.
  const predicate = tokens
    .map((t) => {
      const variants = [
        ...new Set([t, t.toLowerCase(), t.toUpperCase(), t[0].toUpperCase() + t.slice(1).toLowerCase()]),
      ];
      return `hasAnyTokens(Body, [${variants.map((v) => `'${v}'`).join(", ")}])`;
    })
    .join(" AND ");

  // Collector lag: anchor the window on the freshest log, like /api/analytics/sre.
  // TimestampTime is in the primary key, so this bound also prunes on the PK.
  const where = `
    TimestampTime >= (SELECT max(TimestampTime) FROM otel_logs) - INTERVAL ${hours} HOUR
    AND ${predicate}
    ${severityClause}`;

  const client = getClickHouseClient();
  const settings = {
    readonly: "1",
    max_execution_time: MAX_EXECUTION_TIME,
    allow_experimental_full_text_index: 1,
  } as const;

  try {
    // Count first with wait_end_of_query so X-ClickHouse-Summary carries
    // complete server-side execution stats (elapsed, rows/bytes read).
    const t0 = Date.now();
    const countResult = await client.query({
      query: `SELECT count() AS total FROM otel_logs WHERE ${where}`,
      format: "JSONEachRow",
      clickhouse_settings: { ...settings, wait_end_of_query: 1 },
    });
    const wallMs = Date.now() - t0;
    const countRows = (await countResult.json()) as { total: string }[];
    const totalMatches = Number(countRows[0]?.total ?? 0);

    let summary: Record<string, string> = {};
    try {
      summary = JSON.parse(String(countResult.response_headers["x-clickhouse-summary"] ?? "{}"));
    } catch {
      /* keep empty summary */
    }

    const rowsResult = await client.query({
      query: `
        SELECT
          toString(Timestamp) AS timestamp,
          if(SeverityText = '', 'UNSET', SeverityText) AS severity,
          ServiceName AS service,
          substring(replaceRegexpAll(Body, '\\\\x1b\\\\[[0-9;]*m', ''), 1, 500) AS body,
          TraceId AS trace_id
        FROM otel_logs
        WHERE ${where}
        ORDER BY Timestamp DESC
        LIMIT ${MAX_RESULTS}`,
      format: "JSONEachRow",
      clickhouse_settings: settings,
    });
    const results = (await rowsResult.json()) as LogRow[];

    const elapsedNs = Number(summary.elapsed_ns ?? 0);
    return NextResponse.json({
      tokens,
      severity,
      range,
      totalMatches,
      results,
      metrics: {
        serverTimeMs: elapsedNs ? Math.round(elapsedNs / 1e4) / 100 : wallMs,
        wallTimeMs: wallMs,
        rowsRead: Number(summary.read_rows ?? 0),
        bytesRead: Number(summary.read_bytes ?? 0),
      },
    });
  } catch (err) {
    console.error("[logs/search] failed:", (err as Error).message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
