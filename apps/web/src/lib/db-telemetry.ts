import { metrics } from "@opentelemetry/api";

// Shared helpers for the ClickHouse / Postgres query wrappers: SQL parsing
// for span attributes plus RED-style DB metrics (query rate, errors, latency).

const meter = metrics.getMeter("clickshop-api");

export const dbQueryCounter = meter.createCounter("clickshop.db.queries", {
  description: "Database queries executed, by system/operation/table",
});
export const dbErrorCounter = meter.createCounter("clickshop.db.errors", {
  description: "Database queries that failed, by system/operation/table",
});
export const dbDurationHistogram = meter.createHistogram("clickshop.db.query.duration", {
  description: "Database query duration, by system/operation/table",
  unit: "ms",
});
export const dbRowsHistogram = meter.createHistogram("clickshop.db.rows_returned", {
  description: "Rows returned per query, by system/table",
  unit: "{rows}",
});

export interface ParsedSql {
  operation: string;
  table: string;
}

// Best-effort extraction of the operation keyword and the primary table.
// Not a SQL parser: good enough for span attributes on demo queries.
export function parseSql(sql: string): ParsedSql {
  const trimmed = sql.trim();
  const operation = (trimmed.match(/^[a-zA-Z]+/)?.[0] ?? "unknown").toUpperCase();
  const tableMatch =
    trimmed.match(/\bfrom\s+([a-zA-Z0-9_."]+)/i) ??
    trimmed.match(/\binto\s+([a-zA-Z0-9_."]+)/i) ??
    trimmed.match(/\bupdate\s+([a-zA-Z0-9_."]+)/i) ??
    trimmed.match(/\btable\s+([a-zA-Z0-9_."]+)/i);
  const table = (tableMatch?.[1] ?? "unknown").replace(/"/g, "");
  return { operation, table };
}

export function normalizeStatement(sql: string, maxLength = 1500): string {
  return sql.replace(/\s+/g, " ").trim().substring(0, maxLength);
}
