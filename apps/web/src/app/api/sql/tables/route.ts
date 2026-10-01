import { NextRequest, NextResponse } from "next/server";
import { queryClickHouse } from "@/lib/clickhouse";
import { queryPostgres } from "@/lib/postgres";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

async function fetchDdl(db: string, table: string): Promise<string | null> {
  if (db === "clickhouse") {
    const rows = await queryClickHouse<{ ddl: string }>(
      `SELECT create_table_query AS ddl FROM system.tables WHERE database = currentDatabase() AND name = '${table}'`,
    );
    return rows[0]?.ddl ?? null;
  }
  const rows = await queryPostgres<{ ddl: string }>(
    `SELECT
       'CREATE TABLE ' || c.relname || E'\\n(\\n' ||
       array_to_string(
         array_agg(
           '    ' || a.attname || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod) ||
           CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END ||
           CASE WHEN d.adbin IS NOT NULL THEN ' DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) ELSE '' END
           ORDER BY a.attnum
         ), E',\\n'
       ) || E'\\n);' AS ddl
     FROM pg_class c
     JOIN pg_attribute a ON a.attrelid = c.oid
     LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
     WHERE c.relname = $1
       AND c.relnamespace = 'public'::regnamespace
       AND a.attnum > 0
       AND NOT a.attisdropped
     GROUP BY c.relname`,
    [table],
  );
  return rows[0]?.ddl ?? null;
}

export async function GET(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const db = req.nextUrl.searchParams.get("database") ?? "clickhouse";
  const ddlTable = req.nextUrl.searchParams.get("ddl");

  try {
    if (ddlTable !== null) {
      if (!IDENTIFIER_RE.test(ddlTable)) {
        return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
      }
      return NextResponse.json({ ddl: await fetchDdl(db, ddlTable) });
    }

    if (db === "clickhouse") {
      const rows = await queryClickHouse<{ name: string; engine: string; total_rows: string }>(
        `SELECT name, engine, toString(total_rows) AS total_rows
         FROM system.tables
         WHERE database = currentDatabase()
           AND name NOT LIKE '_peerdb%'
           AND name NOT LIKE 'otel%'
           AND name NOT LIKE 'hyperdx%'
           AND name NOT LIKE '%_mv'
         ORDER BY
           multiIf(name LIKE 'gold_%', 1, name LIKE 'silver_%', 2, name LIKE 'public_%', 3, 0),
           name`,
      );
      return NextResponse.json(
        rows.map((r) => {
          const layer = r.name.startsWith("gold_") ? "gold"
            : r.name.startsWith("silver_") ? "silver"
            : r.name.startsWith("public_") ? "bronze"
            : undefined;
          return {
            name: r.name,
            engine: r.engine,
            rows: r.total_rows,
            mirrored: r.engine.includes("Replacing"),
            layer,
          };
        }),
      );
    }

    const rows = await queryPostgres<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    return NextResponse.json(rows.map((r) => ({ name: r.table_name })));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
