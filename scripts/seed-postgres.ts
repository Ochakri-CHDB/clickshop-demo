import { Pool } from "pg";
import { readFileSync } from "fs";
import { resolve } from "path";

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("POSTGRES_URL is required. Set it in .env");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url,
    ssl: process.env.POSTGRES_SSL === "true" || /sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
  });

  const sqlPath = resolve(__dirname, "seed/postgres.sql");
  const sql = readFileSync(sqlPath, "utf-8");

  console.log("Seeding PostgreSQL...");
  try {
    await pool.query(sql);
    console.log("PostgreSQL seed complete!");
  } catch (err) {
    console.error("Seed failed:", (err as Error).message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
