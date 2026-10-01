import { NextRequest, NextResponse } from "next/server";
import { pingClickHouse, queryClickHouse } from "@/lib/clickhouse";
import { pingPostgres } from "@/lib/postgres";
import { withApiSpan } from "@/lib/api-telemetry";
import { isAuthenticated } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

async function checkUrl(url: string | undefined, timeoutMs = 5000): Promise<boolean> {
  if (!url) return false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok || res.status === 401 || res.status === 403 || res.status === 405;
  } catch {
    return false;
  }
}

function timedCheck(fn: () => Promise<boolean>): Promise<{ ok: boolean; ms: number }> {
  const start = Date.now();
  return fn()
    .then((ok) => ({ ok, ms: Date.now() - start }))
    .catch(() => ({ ok: false, ms: Date.now() - start }));
}

export async function GET(req: NextRequest) {
  return withApiSpan("/api/health", req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  // Unauthenticated liveness probe: no dependency checks, no internal details.
  if (!(await isAuthenticated())) {
    return NextResponse.json({ status: "ok" });
  }

  const detailed = req.nextUrl.searchParams.get("detailed") === "true";

  const libreChatUrl =
    process.env.LIBRECHAT_INTERNAL_URL || process.env.LIBRECHAT_BASE_URL;
  const otelCollectorUrl =
    process.env.OTEL_COLLECTOR_INTERNAL_URL ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    null;

  const [ch, pg, lc, lf, otelC] = await Promise.all([
    timedCheck(pingClickHouse),
    timedCheck(pingPostgres),
    timedCheck(() => checkUrl(libreChatUrl)),
    timedCheck(() => checkUrl(process.env.LANGFUSE_BASE_URL ? `${process.env.LANGFUSE_BASE_URL.replace(/\/$/, "")}/api/public/health` : undefined)),
    timedCheck(() =>
      otelCollectorUrl
        ? checkUrl(`${otelCollectorUrl}/v1/traces`)
        : Promise.resolve(false),
    ),
  ]);

  // ClickStack (HyperDX) reads the otel_* tables: it is "connected" when
  // ClickHouse is up and the collector that feeds those tables is running.
  const cs = { ok: ch.ok && otelC.ok, ms: ch.ms };

  // MCP servers run inside the LibreChat container (stdio) or are reached
  // from it over streamable HTTP (Langfuse). If LibreChat is up and the
  // backing service is up, the MCP is available.
  const mcpCh = { ok: lc.ok && ch.ok, ms: 0 };
  const mcpPg = { ok: lc.ok && pg.ok, ms: 0 };
  const mcpLf = { ok: lc.ok && lf.ok, ms: 0 };
  // clickshop-observability: ClickHouse MCP scoped to the otel_* / hyperdx tables.
  const mcpObs = { ok: lc.ok && ch.ok, ms: 0 };

  const langfuseConfigured = !!(
    process.env.LANGFUSE_PUBLIC_KEY &&
    process.env.LANGFUSE_SECRET_KEY &&
    process.env.LANGFUSE_BASE_URL
  );

  let cdcTables = 0;
  let cdcTotalRows = 0;
  let cdcRunning = false;
  let cdcLagSeconds = -1;
  if (ch.ok) {
    try {
      const tablesRes = await queryClickHouse<{ cnt: string }>(
        "SELECT count() AS cnt FROM system.tables WHERE database = currentDatabase() AND name LIKE 'public_%' AND name NOT LIKE '%raw_mirror%'"
      );
      cdcTables = Number(tablesRes[0]?.cnt ?? 0);

      if (cdcTables > 0) {
        const rowsRes = await queryClickHouse<{ total: string }>(
          "SELECT sum(total_rows) AS total FROM system.tables WHERE database = currentDatabase() AND name LIKE 'public_%' AND name NOT LIKE '%raw_mirror%'"
        );
        cdcTotalRows = Number(rowsRes[0]?.total ?? 0);
        // The init job pre-creates the public_* tables, so "running" means the
        // CDC engine (PeerDB or ClickPipes) actually wrote rows recently.
        const lagRes = await queryClickHouse<{ lag: string }>(
          "SELECT dateDiff('second', max(_peerdb_synced_at), now64()) AS lag FROM public_orders",
        );
        cdcLagSeconds = Number(lagRes[0]?.lag ?? -1);
        cdcRunning = cdcTotalRows > 0 && cdcLagSeconds >= 0 && cdcLagSeconds < 3600;
      }
    } catch { /* CDC query failed */ }
  }

  const clickpipesReady = ch.ok && pg.ok && cdcRunning;

  const envValid = !!(
    process.env.CLICKHOUSE_HOST &&
    process.env.CLICKHOUSE_PASSWORD &&
    process.env.POSTGRES_URL
  );

  const body: Record<string, unknown> = {
    clickhouse: ch.ok,
    postgres: pg.ok,
    librechat: lc.ok,
    librechatUrl: process.env.LINK_LIBRECHAT || libreChatUrl || "",
    langfuse: lf.ok,
    otelCollector: otelC.ok,
    clickstack: cs.ok,
    mcpClickhouse: mcpCh.ok,
    mcpPostgres: mcpPg.ok,
    mcpLangfuse: mcpLf.ok,
    mcpObservability: mcpObs.ok,
    clickpipes: clickpipesReady,
    clickpipesDetail: clickpipesReady
      ? `Running: ${cdcTables} tables, ${cdcTotalRows.toLocaleString()} records, last sync ${cdcLagSeconds}s ago`
      : ch.ok && pg.ok
        ? "No recent CDC sync (mirror not created yet or paused)"
        : "PG or CH unreachable",
    cdcTables,
    cdcTotalRows,
    envValid,
  };

  if (detailed) {
    body.clickhouseLatency = ch.ms;
    body.postgresLatency = pg.ms;
    body.langfuseConfigured = langfuseConfigured;
    body.envErrors = [];
    if (!process.env.CLICKHOUSE_HOST) (body.envErrors as string[]).push("CLICKHOUSE_HOST missing");
    if (!process.env.CLICKHOUSE_PASSWORD) (body.envErrors as string[]).push("CLICKHOUSE_PASSWORD missing");
    if (!process.env.POSTGRES_URL) (body.envErrors as string[]).push("POSTGRES_URL missing");
  }

  return NextResponse.json(body);
}
