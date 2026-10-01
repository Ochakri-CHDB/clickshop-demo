import { NextRequest, NextResponse } from "next/server";
import { getClickHouseClient } from "@/lib/clickhouse";
import { getPool } from "@/lib/postgres";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Uploads never touch demo tables: the target database/schema is fixed here
// and every table name is forced under the uploads_ prefix.
const CH_DATABASE = process.env.CLICKHOUSE_DATABASE || "default";
const PG_SCHEMA = "uploads";
const TABLE_PREFIX = "uploads_";

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;
const RESERVED_COLUMNS = new Set(["_uploaded_at"]);

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 50_000;
const MAX_COLUMNS = 100;
const MAX_CELL_LENGTH = 10_000;
const PG_MAX_PARAMS = 60_000;

class UploadError extends Error {}

function quoteChIdent(name: string): string {
  if (!IDENTIFIER_RE.test(name)) throw new UploadError(`Invalid identifier: ${JSON.stringify(name)}`);
  return `\`${name}\``;
}

function quotePgIdent(name: string): string {
  if (!IDENTIFIER_RE.test(name)) throw new UploadError(`Invalid identifier: ${JSON.stringify(name)}`);
  return `"${name}"`;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCSV(text: string): { headers: string[]; rows: (string | null)[][] } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new UploadError("CSV is empty or has no data rows");
  if (lines.length - 1 > MAX_ROWS) throw new UploadError(`CSV exceeds ${MAX_ROWS} rows`);

  const headers = parseCsvLine(lines[0]);
  if (headers.length > MAX_COLUMNS) throw new UploadError(`CSV exceeds ${MAX_COLUMNS} columns`);
  const seen = new Set<string>();
  for (const h of headers) {
    if (!IDENTIFIER_RE.test(h)) {
      throw new UploadError(
        `Invalid column name ${JSON.stringify(h)}: use letters, digits and underscores, starting with a letter or underscore`,
      );
    }
    const key = h.toLowerCase();
    if (seen.has(key)) throw new UploadError(`Duplicate column name: ${h}`);
    if (RESERVED_COLUMNS.has(key)) throw new UploadError(`Reserved column name: ${h}`);
    seen.add(key);
  }

  const rows = lines.slice(1).map((line, idx) => {
    const values = parseCsvLine(line);
    if (values.length > headers.length) {
      throw new UploadError(`Row ${idx + 2} has ${values.length} values, header has ${headers.length}`);
    }
    return headers.map((_, ci) => {
      const v = values[ci];
      if (v === undefined || v === "" || v === "NULL") return null;
      if (v.length > MAX_CELL_LENGTH) throw new UploadError(`Row ${idx + 2}: value exceeds ${MAX_CELL_LENGTH} characters`);
      return v;
    });
  });
  return { headers, rows };
}

function resolveTableName(raw: string): string {
  const base = raw.trim();
  const name = base.toLowerCase().startsWith(TABLE_PREFIX) ? base : `${TABLE_PREFIX}${base}`;
  if (!IDENTIFIER_RE.test(base) || !IDENTIFIER_RE.test(name)) {
    throw new UploadError(
      "Invalid table name: use letters, digits and underscores (max 64 chars), starting with a letter or underscore",
    );
  }
  return name;
}

async function uploadToClickHouse(table: string, headers: string[], rows: (string | null)[][]) {
  const client = getClickHouseClient();
  const fqTable = `${quoteChIdent(CH_DATABASE)}.${quoteChIdent(table)}`;

  const existing = await client.query({
    query: "SELECT engine FROM system.tables WHERE database = {db:String} AND name = {name:String}",
    query_params: { db: CH_DATABASE, name: table },
    format: "JSONEachRow",
  });
  const found = (await existing.json()) as { engine: string }[];
  if (found.length === 0) {
    const cols = headers.map((h) => `${quoteChIdent(h)} Nullable(String)`).join(", ");
    await client.command({
      query: `CREATE TABLE IF NOT EXISTS ${fqTable} (${cols}, \`_uploaded_at\` DateTime DEFAULT now())
              ENGINE = MergeTree ORDER BY tuple() TTL _uploaded_at + INTERVAL 30 DAY`,
    });
  } else if (found[0].engine !== "MergeTree") {
    throw new UploadError(`Table ${table} exists and is not an upload table`);
  }

  await client.insert({
    table: fqTable,
    columns: headers as [string, ...string[]],
    values: rows.map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i]]))),
    format: "JSONEachRow",
    clickhouse_settings: { input_format_skip_unknown_fields: 0 },
  });
}

async function uploadToPostgres(table: string, headers: string[], rows: (string | null)[][]) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 30000");
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotePgIdent(PG_SCHEMA)}`);
    const fqTable = `${quotePgIdent(PG_SCHEMA)}.${quotePgIdent(table)}`;
    const cols = headers.map((h) => `${quotePgIdent(h)} TEXT`).join(", ");
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${fqTable} (${cols}, "_uploaded_at" TIMESTAMPTZ NOT NULL DEFAULT now())`,
    );

    const colList = headers.map(quotePgIdent).join(",");
    const batchSize = Math.max(1, Math.floor(PG_MAX_PARAMS / headers.length));
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const placeholders = batch
        .map((_, ri) => `(${headers.map((_, ci) => `$${ri * headers.length + ci + 1}`).join(",")})`)
        .join(",");
      await client.query(`INSERT INTO ${fqTable} (${colList}) VALUES ${placeholders}`, batch.flat());
    }
    await client.query("COMMIT");
    return `${PG_SCHEMA}.${table}`;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FILE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: `File exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB` }, { status: 413 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const rawTable = formData.get("table");
    const database = formData.get("database");

    if (!(file instanceof File) || typeof rawTable !== "string") {
      return NextResponse.json({ error: "Missing file or table" }, { status: 400 });
    }
    if (database !== "clickhouse" && database !== "postgres") {
      return NextResponse.json({ error: 'database must be "clickhouse" or "postgres"' }, { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `File exceeds ${MAX_FILE_BYTES / 1024 / 1024} MB` }, { status: 413 });
    }

    const table = resolveTableName(rawTable);
    const { headers, rows } = parseCSV(await file.text());

    const startMs = Date.now();
    const target =
      database === "clickhouse"
        ? (await uploadToClickHouse(table, headers, rows), `${CH_DATABASE}.${table}`)
        : await uploadToPostgres(table, headers, rows);

    return NextResponse.json({
      inserted: rows.length,
      table: target,
      database,
      durationMs: Date.now() - startMs,
    });
  } catch (err) {
    if (err instanceof UploadError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
