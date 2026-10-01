import { NextRequest, NextResponse } from "next/server";
import { queryClickHouse } from "@/lib/clickhouse";
import { withApiSpan } from "@/lib/api-telemetry";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// Observability dashboards over the ClickStack OTel tables
// (otel_traces / otel_logs / otel_metrics_gauge) in the clickshop database.

const RANGE_HOURS: Record<string, number> = {
  "1h": 1,
  "6h": 6,
  "1d": 24,
  "7d": 168,
};

export async function GET(req: NextRequest) {
  return withApiSpan("/api/analytics/sre", req, () => handleGet(req));
}

async function handleGet(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const t0 = Date.now();
  try {
    const range = req.nextUrl.searchParams.get("range") ?? "1d";
    const hours = RANGE_HOURS[range] ?? 24;
    // The collector can lag; anchor windows on the freshest span instead of now().
    const anchor = `(SELECT max(Timestamp) FROM otel_traces)`;
    const since = `${anchor} - INTERVAL ${hours} HOUR`;
    const prevSince = `${anchor} - INTERVAL ${hours * 2} HOUR`;
    // Buckets: minutes for <=6h, hours above.
    const bucket = hours <= 6
      ? `toStartOfInterval(Timestamp, INTERVAL ${Math.max(Math.round((hours * 60) / 48), 1)} MINUTE)`
      : `toStartOfInterval(Timestamp, INTERVAL ${Math.max(Math.round(hours / 48), 1)} HOUR)`;

    const serverSpans = `otel_traces WHERE SpanKind = 'Server' AND Timestamp >= ${since}`;

    const [
      kpiRows, prevKpiRows, requestTrendRows, latencyTrendRows,
      slowRouteRows, logSeverityRows, logTrendRows, serviceRows, logVolumeRows,
    ] = await Promise.all([
      queryClickHouse(`
        SELECT
          count() AS totalRequests,
          round(countIf(StatusCode = 'Error') / greatest(count(), 1) * 100, 2) AS errorRate,
          round(quantile(0.5)(Duration / 1e6), 1) AS p50,
          round(quantile(0.95)(Duration / 1e6), 1) AS p95,
          round(count() / ${hours * 60}, 1) AS reqPerMin
        FROM ${serverSpans}`),
      queryClickHouse(`
        SELECT count() AS totalRequests, countIf(StatusCode = 'Error') AS errors
        FROM otel_traces
        WHERE SpanKind = 'Server' AND Timestamp >= ${prevSince} AND Timestamp < ${since}`),
      queryClickHouse(`
        SELECT ${bucket} AS date, count() AS requests, countIf(StatusCode = 'Error') AS errors
        FROM ${serverSpans}
        GROUP BY date ORDER BY date`),
      queryClickHouse(`
        SELECT ${bucket} AS date,
          round(quantile(0.5)(Duration / 1e6), 1) AS p50,
          round(quantile(0.95)(Duration / 1e6), 1) AS p95
        FROM ${serverSpans}
        GROUP BY date ORDER BY date`),
      queryClickHouse(`
        SELECT SpanName AS route,
          count() AS requests,
          round(quantile(0.95)(Duration / 1e6), 1) AS p95,
          round(avg(Duration / 1e6), 1) AS avgMs,
          countIf(StatusCode = 'Error') AS errors
        FROM ${serverSpans} AND ServiceName = 'clickshop-api'
        GROUP BY route ORDER BY p95 DESC LIMIT 8`),
      queryClickHouse(`
        SELECT if(SeverityText = '', 'UNSET', SeverityText) AS name, count() AS value
        FROM otel_logs WHERE Timestamp >= ${since.replace("otel_traces", "otel_logs")}
        GROUP BY name ORDER BY value DESC`),
      queryClickHouse(`
        SELECT ${bucket} AS date,
          countIf(SeverityText = 'ERROR') AS errors,
          countIf(SeverityText = 'WARN') AS warnings,
          countIf(SeverityText = 'INFO') AS info
        FROM otel_logs WHERE Timestamp >= ${since.replace("otel_traces", "otel_logs")}
        GROUP BY date ORDER BY date`),
      queryClickHouse(`
        SELECT ServiceName AS service,
          count() AS spans,
          round(quantile(0.95)(Duration / 1e6), 1) AS p95,
          round(countIf(StatusCode = 'Error') / greatest(count(), 1) * 100, 2) AS errorRate,
          max(Timestamp) AS lastSeen
        FROM otel_traces WHERE Timestamp >= ${since}
        GROUP BY service ORDER BY spans DESC`),
      queryClickHouse(`
        SELECT count() AS totalLogs, countIf(SeverityText = 'ERROR') AS errorLogs
        FROM otel_logs WHERE Timestamp >= ${since.replace("otel_traces", "otel_logs")}`),
    ]);

    const kpiRaw = kpiRows[0] as Record<string, unknown> | undefined;
    const prevRaw = prevKpiRows[0] as Record<string, unknown> | undefined;
    const logsRaw = logVolumeRows[0] as Record<string, unknown> | undefined;

    const totalRequests = Number(kpiRaw?.totalRequests ?? 0);
    const prevRequests = Number(prevRaw?.totalRequests ?? 0);

    const fmtBucket = (v: unknown) => {
      const s = String(v);
      return hours <= 6 ? s.slice(11, 16) : s.slice(5, 13).replace(" ", " ") + "h";
    };

    return NextResponse.json({
      kpi: {
        totalRequests,
        errorRate: Number(kpiRaw?.errorRate ?? 0),
        p50: Number(kpiRaw?.p50 ?? 0),
        p95: Number(kpiRaw?.p95 ?? 0),
        reqPerMin: Number(kpiRaw?.reqPerMin ?? 0),
        totalLogs: Number(logsRaw?.totalLogs ?? 0),
        errorLogs: Number(logsRaw?.errorLogs ?? 0),
        services: serviceRows.length,
      },
      changes: {
        requests: prevRequests > 0 ? +(((totalRequests - prevRequests) / prevRequests) * 100).toFixed(1) : 0,
      },
      requestTrend: requestTrendRows.map((r: Record<string, unknown>) => ({
        date: fmtBucket(r.date), requests: Number(r.requests), errors: Number(r.errors),
      })),
      latencyTrend: latencyTrendRows.map((r: Record<string, unknown>) => ({
        date: fmtBucket(r.date), p50: Number(r.p50), p95: Number(r.p95),
      })),
      slowRoutes: slowRouteRows.map((r: Record<string, unknown>) => ({
        route: String(r.route), requests: Number(r.requests), p95: Number(r.p95),
        avgMs: Number(r.avgMs), errors: Number(r.errors),
      })),
      logSeverity: logSeverityRows.map((r: Record<string, unknown>) => ({
        name: String(r.name), value: Number(r.value),
      })),
      logTrend: logTrendRows.map((r: Record<string, unknown>) => ({
        date: fmtBucket(r.date), errors: Number(r.errors), warnings: Number(r.warnings), info: Number(r.info),
      })),
      services: serviceRows.map((r: Record<string, unknown>) => ({
        service: String(r.service), spans: Number(r.spans), p95: Number(r.p95),
        errorRate: Number(r.errorRate), lastSeen: String(r.lastSeen).slice(0, 16),
      })),
      queryTimeMs: Date.now() - t0,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, queryTimeMs: Date.now() - t0 }, { status: 500 });
  }
}
