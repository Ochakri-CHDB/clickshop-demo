import { createClient } from "@clickhouse/client-web";
import { readFileSync } from "fs";
import { resolve } from "path";

async function main() {
  const host = process.env.CLICKHOUSE_HOST;
  if (!host) {
    console.error("CLICKHOUSE_HOST is required. Set it in .env");
    process.exit(1);
  }

  const port = process.env.CLICKHOUSE_PORT ?? "8443";
  const secure = process.env.CLICKHOUSE_SECURE !== "false";
  const client = createClient({
    url: `${secure ? "https" : "http"}://${host}:${port}`,
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "",
    database: process.env.CLICKHOUSE_DATABASE ?? "default",
    request_timeout: 30_000,
  });

  const sqlPath = resolve(__dirname, "seed/clickhouse.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => {
      const meaningful = s
        .split("\n")
        .filter((line) => line.trim().length > 0 && !line.trim().startsWith("--"))
        .join("\n")
        .trim();
      return meaningful.length > 0;
    });

  console.log(`Seeding ClickHouse with ${statements.length} statements...`);

  for (const stmt of statements) {
    try {
      await client.command({ query: stmt });
      const firstLine = stmt.split("\n").find((l) => l.trim().length > 0) ?? stmt.slice(0, 60);
      console.log(`  ✓ ${firstLine.slice(0, 80)}`);
    } catch (err) {
      console.error(`  ✗ Failed: ${stmt.slice(0, 80)}...`);
      console.error(`    ${(err as Error).message}`);
    }
  }

  console.log("ClickHouse seed complete!");
}

main();
