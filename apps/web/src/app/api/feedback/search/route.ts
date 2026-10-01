import { NextRequest, NextResponse } from "next/server";
import { getClickHouseClient } from "@/lib/clickhouse";
import { withApiSpan } from "@/lib/api-telemetry";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
// "none" mode scans every row of customer_feedback.
export const maxDuration = 60;

// Search demo over customer_feedback.
// One table, the same text in three columns, each with its own index strategy:
//   fts   -> feedback_text_fts   (experimental full-text index, TYPE text)
//   bloom -> feedback_text_bloom (skip index tokenbf_v1)
//   none  -> feedback_text_plain (no secondary index, full column scan)

const MODE_COLUMNS: Record<string, string> = {
  fts: "feedback_text_fts",
  bloom: "feedback_text_bloom",
  none: "feedback_text_plain",
};

const MAX_QUERY_LENGTH = 100;
const MAX_TOKENS = 5;
const MAX_EXECUTION_TIME = 30;

interface SearchRow {
  feedback_id: string;
  product_name: string;
  category: string;
  rating: number;
  feedback_text: string;
  created_at: string;
}

function extractTokens(raw: string): string[] {
  // hasToken splits on non-alphanumeric characters, mirror that here.
  const tokens = raw.match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(tokens.filter((t) => t.length >= 2))].slice(0, MAX_TOKENS);
}

function parseGranules(explain: string): { selected: number; total: number } | null {
  // In the EXPLAIN indexes=1 output, the "Granules: X/Y" line following the
  // Skip index section reflects granules kept after index filtering.
  const skipSection = explain.split(/^\s*Skip\s*$/m)[1];
  const m = (skipSection ?? "").match(/Granules: (\d+)\/(\d+)/);
  if (m) return { selected: Number(m[1]), total: Number(m[2]) };
  const all = [...explain.matchAll(/Granules: (\d+)\/(\d+)/g)];
  if (!all.length) return null;
  const last = all[all.length - 1];
  return { selected: Number(last[1]), total: Number(last[2]) };
}

export async function POST(req: NextRequest) {
  return withApiSpan("/api/feedback/search", req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  let body: { query?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawQuery = String(body.query ?? "").slice(0, MAX_QUERY_LENGTH);
  const mode = String(body.mode ?? "fts");
  const column = MODE_COLUMNS[mode];
  if (!column) {
    return NextResponse.json({ error: "mode must be fts, bloom or none" }, { status: 400 });
  }

  const tokens = extractTokens(rawQuery);
  if (!tokens.length) {
    return NextResponse.json({ error: "Query must contain at least one word (2+ characters)" }, { status: 400 });
  }

  // Tokens are alphanumeric-only (regex above), safe to inline.
  // hasToken is case-sensitive; match as-typed / lowercase / Capitalized
  // variants (identical predicate in all three modes: comparison stays fair).
  const predicate = tokens
    .map((t) => {
      const variants = [...new Set([t, t.toLowerCase(), t[0].toUpperCase() + t.slice(1).toLowerCase()])];
      return `(${variants.map((v) => `hasToken(${column}, '${v}')`).join(" OR ")})`;
    })
    .join(" AND ");

  const client = getClickHouseClient();
  const settings = {
    readonly: "1",
    max_execution_time: MAX_EXECUTION_TIME,
    use_query_cache: 0,
    allow_experimental_full_text_index: 1,
  } as const;

  try {
    // 1. Benchmark query: total match count. Its metrics (elapsed, rows and
    //    bytes read) are what the UI compares across modes.
    const t0 = Date.now();
    const countResult = await client.query({
      query: `SELECT count() AS total FROM customer_feedback WHERE ${predicate}`,
      format: "JSONEachRow",
      clickhouse_settings: { ...settings, wait_end_of_query: 1 },
    });
    const wallMs = Date.now() - t0;
    const countRows = (await countResult.json()) as { total: string }[];
    const totalMatches = Number(countRows[0]?.total ?? 0);

    // X-ClickHouse-Summary carries server-side execution stats.
    const summaryHeader = countResult.response_headers["x-clickhouse-summary"];
    let summary: Record<string, string> = {};
    try {
      summary = JSON.parse(String(summaryHeader ?? "{}"));
    } catch {
      /* keep empty summary */
    }

    // 2. Granule stats from EXPLAIN (planning only, no execution).
    let granules: { selected: number; total: number } | null = null;
    try {
      const explainResult = await client.query({
        query: `EXPLAIN indexes = 1 SELECT count() FROM customer_feedback WHERE ${predicate}`,
        format: "TabSeparatedRaw",
        clickhouse_settings: settings,
      });
      granules = parseGranules(await explainResult.text());
    } catch {
      /* granule stats are optional */
    }

    // 3. Top results (LIMIT short-circuits, identical for all three modes).
    const rowsResult = await client.query({
      query: `
        SELECT feedback_id, product_name, category, rating,
               ${column} AS feedback_text, toString(created_at) AS created_at
        FROM customer_feedback
        WHERE ${predicate}
        LIMIT 20`,
      format: "JSONEachRow",
      clickhouse_settings: settings,
    });
    const results = ((await rowsResult.json()) as SearchRow[]).sort((a, b) => b.rating - a.rating);

    const elapsedNs = Number(summary.elapsed_ns ?? 0);
    return NextResponse.json({
      mode,
      tokens,
      totalMatches,
      results,
      metrics: {
        serverTimeMs: elapsedNs ? Math.round(elapsedNs / 1e4) / 100 : wallMs,
        wallTimeMs: wallMs,
        rowsRead: Number(summary.read_rows ?? 0),
        bytesRead: Number(summary.read_bytes ?? 0),
        granulesSelected: granules?.selected ?? null,
        granulesTotal: granules?.total ?? null,
      },
    });
  } catch (err) {
    const message = (err as Error).message ?? "";
    const isTimeout = message.includes("TIMEOUT_EXCEEDED") || message.includes("Timeout exceeded");
    if (isTimeout) {
      return NextResponse.json(
        { mode, tokens, timeout: true, timeoutSeconds: MAX_EXECUTION_TIME },
        { status: 200 },
      );
    }
    console.error("[feedback/search] failed:", message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
