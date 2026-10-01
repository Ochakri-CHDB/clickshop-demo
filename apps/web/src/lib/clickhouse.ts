import { createClient } from "@clickhouse/client-web";
import { trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";
import { parseSql, normalizeStatement, dbQueryCounter, dbErrorCounter, dbDurationHistogram, dbRowsHistogram } from "./db-telemetry";

let _client: ReturnType<typeof createClient> | null = null;

const chTracer = trace.getTracer("clickshop-api");

export function getClickHouseClient() {
  if (_client) return _client;

  const host = process.env.CLICKHOUSE_HOST;
  const port = process.env.CLICKHOUSE_PORT ?? "8443";
  const secure = process.env.CLICKHOUSE_SECURE !== "false";
  const protocol = secure ? "https" : "http";

  _client = createClient({
    url: `${protocol}://${host}:${port}`,
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "",
    database: process.env.CLICKHOUSE_DATABASE ?? "default",
    request_timeout: 60_000,
  });
  return _client;
}

export async function queryClickHouse<T = Record<string, unknown>>(
  query: string,
): Promise<T[]> {
  const { operation, table } = parseSql(query);
  const metricAttrs = { "db.system": "clickhouse", "db.operation": operation, "db.sql.table": table };

  return chTracer.startActiveSpan(
    `clickhouse.${operation} ${table}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "db.system": "clickhouse",
        "db.name": process.env.CLICKHOUSE_DATABASE ?? "default",
        "db.user": process.env.CLICKHOUSE_USER ?? "default",
        "db.operation": operation,
        "db.sql.table": table,
        "db.statement": normalizeStatement(query),
        "peer.service": "clickhouse",
        "server.address": process.env.CLICKHOUSE_HOST ?? "",
        "server.port": Number(process.env.CLICKHOUSE_PORT ?? 8443),
      },
    },
    (span) => {
      const t0 = Date.now();
      return (async () => {
        try {
          const client = getClickHouseClient();
          span.addEvent("query.start");
          const result = await client.query({ query, format: "JSONEachRow" });
          const rows = (await result.json()) as T[];
          const durationMs = Date.now() - t0;
          span.addEvent("query.complete", { "db.rows_returned": rows.length, "db.duration_ms": durationMs });
          span.setAttribute("db.rows_returned", rows.length);
          span.setAttribute("db.duration_ms", durationMs);
          span.setStatus({ code: SpanStatusCode.OK });

          dbQueryCounter.add(1, metricAttrs);
          dbDurationHistogram.record(durationMs, metricAttrs);
          dbRowsHistogram.record(rows.length, { "db.system": "clickhouse", "db.sql.table": table });
          return rows;
        } catch (err) {
          const error = err as Error;
          console.error("[ClickHouse] Query failed:", error.message);
          span.setAttribute("db.duration_ms", Date.now() - t0);
          span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
          span.recordException(error);
          dbQueryCounter.add(1, metricAttrs);
          dbErrorCounter.add(1, { ...metricAttrs, "error.type": error.name });
          return [];
        } finally {
          span.end();
        }
      })();
    },
  );
}

export async function pingClickHouse(): Promise<boolean> {
  try {
    const client = getClickHouseClient();
    const result = await client.query({ query: "SELECT 1", format: "JSONEachRow" });
    const rows = await result.json();
    return rows.length > 0;
  } catch {
    return false;
  }
}
