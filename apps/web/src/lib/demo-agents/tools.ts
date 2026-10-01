/**
 * Real tools for the Langfuse trace playground. Each execution is traced as a
 * TOOL observation by the runners. Queries are read-only guarded.
 */
import { runReadOnlyClickHouse, runReadOnlyPostgres, validateReadOnlySql } from "@/lib/sql-guard";
import type { AnthropicToolDef } from "./anthropic";

export interface ToolExecution {
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
  error?: string;
}

export const CLICKHOUSE_SCHEMA_HINT = `ClickHouse key tables and columns:
- order_events(event_id, event_time, order_id, customer_id, product_sku, product_name, category, quantity, unit_price, total_amount, payment_method, status, country, channel, device)
- payment_events(event_id, event_time, order_id, user_id, amount, currency, payment_method, provider, status, failure_reason, country)
- page_events(event_id, event_time, session_id, user_id, page_url, page_type, device, country, referrer)
Revenue = sum(total_amount) on order_events. Use event_time for time filters (e.g. event_time >= now() - INTERVAL 24 HOUR).`;

export const TOOL_DEFS: AnthropicToolDef[] = [
  {
    name: "clickhouse_query",
    description: `Run a read-only SQL query (SELECT/WITH) against the ClickShop ClickHouse analytics database. ${CLICKHOUSE_SCHEMA_HINT}`,
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "The SELECT query to execute. Always add LIMIT <= 50." },
        reason: { type: "string", description: "Why this query is needed (short)." },
      },
      required: ["sql"],
    },
  },
  {
    name: "postgres_query",
    description:
      "Run a read-only SQL query (SELECT) against the ClickShop PostgreSQL transactional database. Tables: customers, products, orders, order_items, payment_status_current, sales_rep_accounts, vip_customer_flags. Use for lookups on customers, products, orders.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "The SELECT query to execute. Always add LIMIT <= 50." },
        reason: { type: "string", description: "Why this query is needed (short)." },
      },
      required: ["sql"],
    },
  },
  {
    name: "calculator",
    description:
      "Evaluate a basic arithmetic expression (numbers, + - * / % ( ) . and spaces only). Use for growth rates, percentages, projections.",
    input_schema: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Arithmetic expression, e.g. (4520-3980)/3980*100" },
      },
      required: ["expression"],
    },
  },
];

const TOOL_MAX_ROWS = 20;
const TOOL_TIMEOUT_SEC = 20;

function clampLimit(sql: string): string {
  return /\blimit\s+\d+/i.test(sql) ? sql : `${sql} LIMIT ${TOOL_MAX_ROWS}`;
}

function prepareToolSql(raw: string, dialect: "clickhouse" | "postgres"): string {
  const sql = validateReadOnlySql(raw, dialect);
  if (!/^\s*(select|with)\b/i.test(sql)) throw new Error("Only SELECT/WITH queries are allowed");
  return clampLimit(sql);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "clickhouse_query": {
      const sql = prepareToolSql(String(input.sql ?? ""), "clickhouse");
      const { rows } = await runReadOnlyClickHouse(sql, { maxRows: TOOL_MAX_ROWS, timeoutSec: TOOL_TIMEOUT_SEC });
      return { rowCount: rows.length, rows };
    }
    case "postgres_query": {
      const sql = prepareToolSql(String(input.sql ?? ""), "postgres");
      const { rows } = await runReadOnlyPostgres(sql, { maxRows: TOOL_MAX_ROWS, timeoutSec: TOOL_TIMEOUT_SEC });
      return { rowCount: rows.length, rows };
    }
    case "calculator": {
      const expression = String(input.expression ?? "");
      if (!/^[\d\s+\-*/%().]+$/.test(expression)) {
        throw new Error("Expression contains unsupported characters");
      }
      // eslint-disable-next-line no-new-func
      const value = Function(`"use strict"; return (${expression});`)();
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("Expression did not evaluate to a finite number");
      }
      return { expression, value };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
