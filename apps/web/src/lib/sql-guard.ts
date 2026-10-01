import type { QueryConfig } from "pg";
import { getClickHouseClient } from "@/lib/clickhouse";
import { getPool } from "@/lib/postgres";

/**
 * Read-only execution of user-provided SQL (notebook, text2sql output,
 * demo-agent tools). Three independent layers:
 *  1. validateReadOnlySql: single statement, SELECT/WITH/SHOW/DESCRIBE/EXPLAIN
 *     only, no system catalogs, no table functions that reach files/network.
 *  2. ClickHouse: readonly=1 on the request, so the server rejects writes and
 *     any attempt to change settings (including readonly itself).
 *  3. Postgres: BEGIN READ ONLY + statement_timeout, always rolled back,
 *     extended protocol (one statement per Parse message).
 * Row count and duration are capped server-side in both engines.
 */

export type SqlDialect = "clickhouse" | "postgres";

export class SqlGuardError extends Error {}

export const MAX_SQL_LENGTH = 20_000;
export const DEFAULT_MAX_ROWS = 5_000;
export const DEFAULT_TIMEOUT_SEC = 30;

const ALLOWED_FIRST_KEYWORDS = new Set(["select", "with", "show", "describe", "desc", "explain"]);

// Checks below work on word tokens and Set lookups only: no RegExp built from
// strings, so the production minifier cannot alter what is matched.
const FORBIDDEN_KEYWORDS = new Set([
  "insert", "update", "delete", "drop", "alter", "truncate", "create", "grant", "revoke",
  "rename", "attach", "detach", "optimize", "kill", "exchange", "undrop", "backup", "restore",
  "copy", "call", "do", "vacuum", "reindex", "cluster", "lock", "listen", "notify", "prepare",
  "execute", "deallocate", "discard", "reset", "set", "use", "into", "outfile", "settings",
  "readonly", "load", "import", "refresh", "move", "begin", "commit", "rollback", "savepoint",
  "start", "transaction", "checkpoint",
]);

// SHOW is limited to schema browsing: no SHOW USERS / GRANTS / PROCESSLIST / SETTINGS.
const CLICKHOUSE_SHOW_RE =
  /^show\s+(tables|databases|dictionaries|columns|index|indexes|indices|keys|create\s+(table|view|dictionary))\b/;

const FORBIDDEN_SCHEMAS = new Set([
  "system", "information_schema", "pg_catalog", "pg_toast", "mysql", "performance_schema",
]);

const FORBIDDEN_FUNCTIONS = new Set([
  "file", "filecluster", "url", "urlcluster", "s3", "s3cluster", "gcs", "oss", "cosn",
  "remote", "remotesecure", "clusterallreplicas", "mysql", "postgresql", "mongodb", "redis",
  "jdbc", "odbc", "sqlite", "input", "merge", "dictionary", "view", "sleep", "sleepeachrow",
  "set_config", "current_setting", "getsetting", "getserverport", "query_to_xml", "xpath",
]);
const FORBIDDEN_FUNCTION_PREFIXES = [
  "azureblobstorage", "hdfs", "executable", "iceberg", "deltalake", "hudi", "dblink", "lo_",
  "filesystem", "pg_",
];

const WORD_RE = /[a-z_][a-z0-9_]*/g;
const CALL_RE = /([a-z_][a-z0-9_]*)\s*\(/g;
const FORMAT_CLAUSE_RE = /\bformat\s+[a-z]/;

function findForbiddenKeyword(analysis: string): string | null {
  for (const word of analysis.match(WORD_RE) ?? []) {
    if (FORBIDDEN_KEYWORDS.has(word)) return word;
  }
  return null;
}

function findForbiddenSchema(analysis: string): string | null {
  for (const word of analysis.match(WORD_RE) ?? []) {
    if (FORBIDDEN_SCHEMAS.has(word) || word.startsWith("pg_")) return word;
  }
  return null;
}

function findForbiddenFunction(analysis: string): string | null {
  for (const m of Array.from(analysis.matchAll(CALL_RE))) {
    const name = m[1];
    if (FORBIDDEN_FUNCTIONS.has(name) || FORBIDDEN_FUNCTION_PREFIXES.some((p) => name.startsWith(p))) {
      return name;
    }
  }
  return null;
}

interface ScanResult {
  /** SQL with comments removed and literals kept: what gets executed. */
  executable: string;
  /** Lowercased SQL with string literals blanked and identifiers unquoted: what gets checked. */
  analysis: string;
}

/**
 * Lexes the SQL once so validation sees exactly the text that is executed.
 * Comments are removed from the executed text (so they cannot hide anything),
 * string literals are blanked for analysis, quoted identifiers are unquoted
 * for analysis (so "system".tables is still caught).
 */
function scan(sql: string, dialect: SqlDialect): ScanResult {
  let executable = "";
  let analysis = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (ch === "-" && next === "-") {
      while (i < n && sql[i] !== "\n" && sql[i] !== "\r") i++;
      executable += " ";
      analysis += " ";
      continue;
    }
    if (ch === "/" && next === "*") {
      // Nested block comments are handled differently across engines: reject.
      throw new SqlGuardError("Block comments (/* */) are not allowed");
    }
    if (ch === "#") {
      throw new SqlGuardError("'#' comments are not allowed");
    }
    if (ch === "$") {
      throw new SqlGuardError("Dollar-quoted strings and parameters are not allowed");
    }
    if (ch === "\\") {
      throw new SqlGuardError("Backslashes outside string literals are not allowed");
    }

    if (ch === "'") {
      // Postgres honours backslash escapes only in E'...' strings; ClickHouse always does.
      const prev = sql[i - 1] ?? "";
      const prevPrev = sql[i - 2] ?? "";
      const isEString = dialect === "postgres" && /[eE]/.test(prev) && !/[\w$]/.test(prevPrev);
      const backslashEscapes = dialect === "clickhouse" || isEString;
      let j = i + 1;
      let closed = false;
      while (j < n) {
        if (backslashEscapes && sql[j] === "\\") { j += 2; continue; }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { j += 2; continue; }
          closed = true;
          break;
        }
        j++;
      }
      if (!closed) throw new SqlGuardError("Unterminated string literal");
      executable += sql.slice(i, j + 1);
      analysis += "''";
      i = j + 1;
      continue;
    }

    if (ch === '"' || (ch === "`" && dialect === "clickhouse")) {
      const quote = ch;
      let j = i + 1;
      let content = "";
      let closed = false;
      while (j < n) {
        if (sql[j] === "\\") throw new SqlGuardError("Backslashes in quoted identifiers are not allowed");
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) { content += quote; j += 2; continue; }
          closed = true;
          break;
        }
        content += sql[j];
        j++;
      }
      if (!closed) throw new SqlGuardError("Unterminated quoted identifier");
      executable += sql.slice(i, j + 1);
      analysis += ` ${content.toLowerCase()} `;
      i = j + 1;
      continue;
    }

    executable += ch;
    analysis += ch.toLowerCase();
    i++;
  }

  return { executable, analysis };
}

/**
 * Throws SqlGuardError when the SQL is not a single read-only statement.
 * Returns the SQL to execute (comments and trailing semicolons removed).
 */
export function validateReadOnlySql(sql: string, dialect: SqlDialect): string {
  if (typeof sql !== "string" || !sql.trim()) throw new SqlGuardError("Empty query");
  if (sql.length > MAX_SQL_LENGTH) throw new SqlGuardError(`Query exceeds ${MAX_SQL_LENGTH} characters`);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(sql)) {
    throw new SqlGuardError("Control characters are not allowed");
  }

  const { executable, analysis } = scan(sql, dialect);

  const trimmedAnalysis = analysis.replace(/[\s;]+$/, "");
  if (trimmedAnalysis.includes(";")) throw new SqlGuardError("Only one statement per query is allowed");

  const firstWord = trimmedAnalysis.trim().match(/^[a-z]+/)?.[0] ?? "";
  if (!ALLOWED_FIRST_KEYWORDS.has(firstWord)) {
    throw new SqlGuardError("Only SELECT, WITH, SHOW, DESCRIBE and EXPLAIN queries are allowed");
  }

  let keywordScope = trimmedAnalysis.trim();
  if (firstWord === "show") {
    if (dialect !== "clickhouse" || !CLICKHOUSE_SHOW_RE.test(keywordScope)) {
      throw new SqlGuardError("Only SHOW TABLES/DATABASES/COLUMNS/CREATE TABLE are allowed");
    }
    keywordScope = keywordScope.replace(/^show\s+create\s+/, "show ");
  }

  const kw = findForbiddenKeyword(keywordScope);
  if (kw) throw new SqlGuardError(`Keyword not allowed in read-only mode: ${kw.toUpperCase()}`);

  const schema = findForbiddenSchema(trimmedAnalysis);
  if (schema) throw new SqlGuardError(`System catalogs are not accessible: ${schema}`);

  const fn = findForbiddenFunction(trimmedAnalysis);
  if (fn) throw new SqlGuardError(`Function not allowed (file/network/server access): ${fn}`);

  if (FORMAT_CLAUSE_RE.test(trimmedAnalysis)) throw new SqlGuardError("FORMAT clause is not allowed");

  return executable.replace(/[\s;]+$/, "").trim();
}

export interface ReadOnlyResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export interface ReadOnlyOptions {
  maxRows?: number;
  timeoutSec?: number;
}

export async function runReadOnlyClickHouse(
  validatedSql: string,
  opts: ReadOnlyOptions = {},
): Promise<ReadOnlyResult> {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const timeoutSec = opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
  const result = await getClickHouseClient().query({
    query: validatedSql,
    format: "JSONEachRow",
    clickhouse_settings: {
      readonly: "1",
      max_execution_time: timeoutSec,
      max_result_rows: String(maxRows + 1),
      max_result_bytes: String(50 * 1024 * 1024),
      result_overflow_mode: "break",
    },
  });
  const all = (await result.json()) as Record<string, unknown>[];
  const rows = all.slice(0, maxRows);
  return {
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
    rows,
    rowCount: rows.length,
    truncated: all.length > maxRows,
  };
}

export async function runReadOnlyPostgres(
  validatedSql: string,
  opts: ReadOnlyOptions = {},
): Promise<ReadOnlyResult> {
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  const timeoutMs = (opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC) * 1000;
  const extended = (text: string): QueryConfig => ({ text, queryMode: "extended" }) as QueryConfig;

  const client = await getPool().connect();
  let failed: Error | undefined;
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query(`SET LOCAL statement_timeout = ${Math.floor(timeoutMs)}`);
    await client.query(`SET LOCAL idle_in_transaction_session_timeout = ${Math.floor(timeoutMs) + 5000}`);

    const isRowQuery = /^\s*(select|with)\b/i.test(validatedSql);
    if (isRowQuery) {
      // A cursor caps the rows materialised in Node, whatever the query returns.
      await client.query(extended(`DECLARE notebook_cursor NO SCROLL CURSOR FOR ${validatedSql}`));
      const res = await client.query(extended(`FETCH ${maxRows + 1} FROM notebook_cursor`));
      const rows = res.rows.slice(0, maxRows);
      return {
        columns: res.fields.map((f) => f.name),
        rows,
        rowCount: rows.length,
        truncated: res.rows.length > maxRows,
      };
    }

    const res = await client.query(extended(validatedSql));
    const rows = res.rows.slice(0, maxRows);
    return {
      columns: res.fields.map((f) => f.name),
      rows,
      rowCount: rows.length,
      truncated: res.rows.length > maxRows,
    };
  } catch (err) {
    failed = err as Error;
    throw err;
  } finally {
    await client.query("ROLLBACK").catch(() => {});
    client.release(failed);
  }
}

export async function runReadOnlySql(
  sql: string,
  dialect: SqlDialect,
  opts?: ReadOnlyOptions,
): Promise<ReadOnlyResult> {
  const validated = validateReadOnlySql(sql, dialect);
  return dialect === "clickhouse"
    ? runReadOnlyClickHouse(validated, opts)
    : runReadOnlyPostgres(validated, opts);
}
