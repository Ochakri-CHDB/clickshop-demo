import { NextRequest, NextResponse } from "next/server";
import { emitOtelBatch } from "@/lib/otel-sender";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  try {
    const { action } = (await req.json()) as { action: "batch" };
    if (action !== "batch") {
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
    const result = await emitOtelBatch();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function GET() {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
  let collectorUp = false;
  try {
    const res = await fetch(`${endpoint}/v1/traces`, { method: "POST", body: "{}", signal: AbortSignal.timeout(3000) });
    collectorUp = res.status < 500;
  } catch { /* collector not reachable */ }

  return NextResponse.json({
    collectorEndpoint: endpoint,
    collectorUp,
    sdkInitialized: true,
  });
}
