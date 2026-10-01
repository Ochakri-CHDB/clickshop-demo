import { Pool } from "pg";
import { trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";
import { parseSql, normalizeStatement, dbQueryCounter, dbErrorCounter, dbDurationHistogram, dbRowsHistogram } from "./db-telemetry";

let _pool: Pool | null = null;

const pgTracer = trace.getTracer("clickshop-api");

export function getPool(): Pool {
  if (_pool) return _pool;

  const raw = process.env.POSTGRES_URL ?? "";
  const wantsSsl = process.env.POSTGRES_SSL === "true" || /sslmode=(require|verify-ca|verify-full)/.test(raw);
  // pg treats sslmode=require as verify-full; managed Postgres often uses a
  // private CA, so strip it and set TLS explicitly.
  const connectionString = raw.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  _pool = new Pool({
    connectionString,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  return _pool;
}

export async function queryPostgres<T = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const { operation, table } = parseSql(text);
  const metricAttrs = { "db.system": "postgresql", "db.operation": operation, "db.sql.table": table };

  return pgTracer.startActiveSpan(
    `postgresql.${operation} ${table}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        "db.system": "postgresql",
        "db.name": process.env.POSTGRES_DB ?? "postgres",
        "db.user": process.env.POSTGRES_USER ?? "",
        "db.operation": operation,
        "db.sql.table": table,
        "db.statement": normalizeStatement(text),
        "db.query.parameter_count": params?.length ?? 0,
        "peer.service": "postgresql",
        "server.address": process.env.POSTGRES_HOST ?? "",
        "server.port": Number(process.env.POSTGRES_PORT ?? 5432),
      },
    },
    (span) => {
      const t0 = Date.now();
      return (async () => {
        try {
          const pool = getPool();
          span.addEvent("query.start");
          const result = await pool.query(text, params);
          const durationMs = Date.now() - t0;
          span.addEvent("query.complete", { "db.rows_returned": result.rows.length, "db.duration_ms": durationMs });
          span.setAttribute("db.rows_returned", result.rows.length);
          span.setAttribute("db.rows_affected", result.rowCount ?? 0);
          span.setAttribute("db.duration_ms", durationMs);
          span.setStatus({ code: SpanStatusCode.OK });

          dbQueryCounter.add(1, metricAttrs);
          dbDurationHistogram.record(durationMs, metricAttrs);
          dbRowsHistogram.record(result.rows.length, { "db.system": "postgresql", "db.sql.table": table });
          return result.rows as T[];
        } catch (err) {
          const error = err as Error;
          console.error("[PostgreSQL] Query failed:", error.message);
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

export async function pingPostgres(): Promise<boolean> {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT 1 AS ok");
    return result.rows.length > 0;
  } catch {
    return false;
  }
}
