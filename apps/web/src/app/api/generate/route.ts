import { NextRequest, NextResponse } from "next/server";
import { metrics } from "@opentelemetry/api";
import { runBatch, seedLastWeek } from "@/lib/data-generator";
import { getPool } from "@/lib/postgres";
import { requireSession } from "@/lib/api-guard";
import { withApiSpan } from "@/lib/api-telemetry";

export const dynamic = "force-dynamic";

const meter = metrics.getMeter("clickshop-api");
const rowsGeneratedCounter = meter.createCounter("clickshop.generator.rows", {
  description: "Demo rows generated, by target database",
});
const batchCounter = meter.createCounter("clickshop.generator.batches", {
  description: "Generator batches executed, by action",
});

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  return withApiSpan("/api/generate", req, () => handlePost(req));
}

async function handlePost(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const { action, target, batchMultiplier, chRows, pgRows } = (await req.json()) as {
    action: "batch" | "seed-week" | "cleanup-ttl";
    target?: "clickhouse" | "postgres" | "both";
    batchMultiplier?: number;
    chRows?: number;
    pgRows?: number;
  };

  if (action === "batch") {
    const t0 = Date.now();
    const result = await runBatch(target ?? "both", batchMultiplier ?? 1);
    batchCounter.add(1, { action: "batch", target: target ?? "both" });
    rowsGeneratedCounter.add(result.chRows, { "db.system": "clickhouse" });
    rowsGeneratedCounter.add(result.pgRows, { "db.system": "postgresql" });
    return NextResponse.json({ ...result, elapsedMs: Date.now() - t0 });
  }
  if (action === "seed-week") {
    const result = await seedLastWeek(chRows ?? 20000, pgRows ?? 100);
    batchCounter.add(1, { action: "seed-week", target: "both" });
    rowsGeneratedCounter.add(result.chRows, { "db.system": "clickhouse" });
    rowsGeneratedCounter.add(result.pgRows, { "db.system": "postgresql" });
    return NextResponse.json(result);
  }
  if (action === "cleanup-ttl") {
    const pool = getPool();
    const tables = ["order_items", "payment_status_current", "orders"];
    let deleted = 0;
    for (const t of tables) {
      try {
        const col = t === "payment_status_current" ? "updated_at" : "created_at";
        const res = await pool.query(`DELETE FROM ${t} WHERE ${col} < NOW() - INTERVAL '365 days'`);
        deleted += res.rowCount ?? 0;
      } catch { /* ignore */ }
    }
    return NextResponse.json({ ok: true, deleted });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
