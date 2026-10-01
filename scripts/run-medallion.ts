import { createClient } from "@clickhouse/client";
import * as fs from "fs";

const client = createClient({
  url: `https://${process.env.CLICKHOUSE_HOST}:${process.env.CLICKHOUSE_PORT}`,
  username: process.env.CLICKHOUSE_USER,
  password: process.env.CLICKHOUSE_PASSWORD,
  database: "clickshop",
  request_timeout: 120_000,
});

async function run() {
  const sql = fs.readFileSync("scripts/seed-medallion.sql", "utf-8");
  const stmts = sql
    .split(";")
    .map((s) => s.replace(/--[^\n]*/g, "").trim())
    .filter((s) => s.length > 5);

  console.log(`Found ${stmts.length} statements to execute\n`);

  for (let i = 0; i < stmts.length; i++) {
    const stmt = stmts[i];
    const preview = stmt.slice(0, 80).replace(/\n/g, " ");
    process.stdout.write(`[${i + 1}/${stmts.length}] ${preview}... `);
    try {
      await client.command({ query: stmt });
      console.log("OK");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`ERROR: ${msg.slice(0, 200)}`);
    }
  }

  console.log("\nDone. Listing medallion tables:");
  const result = await client.query({
    query: `SELECT name, engine FROM system.tables
            WHERE database = 'clickshop'
              AND (name LIKE 'silver_%' OR name LIKE 'gold_%')
            ORDER BY name`,
    format: "JSONEachRow",
  });
  const rows = await result.json();
  for (const r of rows as Array<{ name: string; engine: string }>) {
    console.log(`  ${r.name.padEnd(40)} ${r.engine}`);
  }

  await client.close();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
