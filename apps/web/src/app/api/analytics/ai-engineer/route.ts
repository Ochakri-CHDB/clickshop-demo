import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { withApiSpan } from "@/lib/api-telemetry";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

// LLM observability dashboards backed by the Langfuse Metrics API v2
// (/api/public/v2/metrics, Langfuse v4 and Langfuse Cloud). v2 has no traces
// view: traces are counted as root observations (isRootObservation = true),
// and costs are summed over every observation of the trace. Results are cached
// in the Next.js data cache (unstable_cache) with a 60s TTL.

const CACHE_TTL_S = 60;

function langfuseAuth(): { base: string; headers: Record<string, string> } | null {
  const pk = process.env.LANGFUSE_PUBLIC_KEY;
  const sk = process.env.LANGFUSE_SECRET_KEY;
  const base = process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com";
  if (!pk || !sk) return null;
  const token = Buffer.from(`${pk}:${sk}`).toString("base64");
  return { base, headers: { Authorization: `Basic ${token}` } };
}

interface MetricsFilter {
  column: string;
  operator: string;
  value: string | number | boolean;
  type: string;
}

interface MetricsQuery {
  view: "observations" | "scores-numeric";
  metrics: { measure: string; aggregation: string }[];
  dimensions: { field: string }[];
  filters?: MetricsFilter[];
  timeDimension?: { granularity: "day" };
  fromTimestamp: string;
  toTimestamp: string;
}

type MetricsRow = Record<string, string | number | null>;

const ROOTS_ONLY: MetricsFilter[] = [{ column: "isRootObservation", operator: "=", value: true, type: "boolean" }];

// Scope to this deployment's tracing environment so Langfuse evaluator runs
// (environment "langfuse-llm-as-a-judge") and other apps sharing the project stay out.
function envFilter(): MetricsFilter[] {
  const env = process.env.LANGFUSE_TRACING_ENVIRONMENT;
  return env ? [{ column: "environment", operator: "=", value: env, type: "string" }] : [];
}

async function lfMetrics(query: MetricsQuery, timings: Record<string, number>, label: string): Promise<MetricsRow[]> {
  const auth = langfuseAuth();
  if (!auth) throw new Error("Langfuse keys not configured");
  const t0 = Date.now();
  const url = `${auth.base}/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify({ ...query, filters: [...envFilter(), ...(query.filters ?? [])] }))}`;
  const res = await fetch(url, { headers: auth.headers, cache: "no-store" });
  timings[label] = Date.now() - t0;
  if (!res.ok) throw new Error(`Langfuse ${res.status} on metrics query "${label}": ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { data: MetricsRow[] };
  return body.data ?? [];
}

const num = (v: string | number | null | undefined) => (v == null ? 0 : +v);

async function fetchAiEngineerData() {
  const toTimestamp = new Date().toISOString();
  const fromTimestamp = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const window = { fromTimestamp, toTimestamp };
  const timings: Record<string, number> = {};

  const [dailyTraces, dailyObservations, modelUsage, tracesByName, costByTraceName, scoresByName] = await Promise.all([
    lfMetrics(
      {
        view: "observations",
        metrics: [{ measure: "count", aggregation: "count" }],
        dimensions: [],
        filters: ROOTS_ONLY,
        timeDimension: { granularity: "day" },
        ...window,
      },
      timings,
      "dailyTraces",
    ),
    lfMetrics(
      {
        view: "observations",
        metrics: [
          { measure: "count", aggregation: "count" },
          { measure: "totalCost", aggregation: "sum" },
        ],
        dimensions: [],
        timeDimension: { granularity: "day" },
        ...window,
      },
      timings,
      "dailyObservations",
    ),
    lfMetrics(
      {
        view: "observations",
        metrics: [
          { measure: "totalTokens", aggregation: "sum" },
          { measure: "totalCost", aggregation: "sum" },
          { measure: "count", aggregation: "count" },
        ],
        dimensions: [{ field: "providedModelName" }],
        ...window,
      },
      timings,
      "modelUsage",
    ),
    lfMetrics(
      {
        view: "observations",
        metrics: [
          { measure: "count", aggregation: "count" },
          { measure: "latency", aggregation: "avg" },
        ],
        dimensions: [{ field: "traceName" }],
        filters: ROOTS_ONLY,
        ...window,
      },
      timings,
      "tracesByName",
    ),
    lfMetrics(
      {
        view: "observations",
        metrics: [{ measure: "totalCost", aggregation: "sum" }],
        dimensions: [{ field: "traceName" }],
        ...window,
      },
      timings,
      "costByTraceName",
    ),
    lfMetrics(
      {
        view: "scores-numeric",
        metrics: [
          { measure: "count", aggregation: "count" },
          { measure: "value", aggregation: "avg" },
        ],
        dimensions: [{ field: "name" }],
        ...window,
      },
      timings,
      "scoresByName",
    ),
  ]);

  // Daily cost & traces trend (metrics API returns days oldest-first, gaps filled).
  const obsByDay = new Map(dailyObservations.map((r) => [r.time_dimension as string, r]));
  const dailyTrend = dailyTraces.map((r) => {
    const obs = obsByDay.get(r.time_dimension as string);
    return {
      date: String(r.time_dimension).slice(5),
      traces: num(r.count_count),
      observations: num(obs?.count_count),
      cost: +num(obs?.sum_totalCost).toFixed(2),
    };
  });

  // Token usage & cost per model across the window.
  const models = modelUsage
    .filter((r) => r.providedModelName)
    .map((r) => ({
      model: String(r.providedModelName),
      tokens: num(r.sum_totalTokens),
      cost: +num(r.sum_totalCost).toFixed(3),
      observations: num(r.count_count),
    }))
    .sort((a, b) => b.cost - a.cost);

  // Traces grouped by name (agent / evaluator / pipeline). Latency is in ms.
  const costByName = new Map(costByTraceName.map((r) => [r.traceName as string, num(r.sum_totalCost)]));
  const traceGroups = tracesByName
    .map((r) => ({
      name: (r.traceName as string) || "(unnamed)",
      count: num(r.count_count),
      avgLatency: +(num(r.avg_latency) / 1000).toFixed(2),
      cost: +(costByName.get(r.traceName as string) ?? 0).toFixed(4),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // LLM-as-judge scores grouped by evaluator name.
  const evaluators = scoresByName
    .map((r) => ({
      name: String(r.name),
      count: num(r.count_count),
      avgScore: +num(r.avg_value).toFixed(3),
    }))
    .sort((a, b) => b.count - a.count);

  const totalTraces = dailyTrend.reduce((s, d) => s + d.traces, 0);
  const totalObservations = dailyTrend.reduce((s, d) => s + d.observations, 0);
  const totalCost = dailyObservations.reduce((s, r) => s + num(r.sum_totalCost), 0);
  const tracesWithLatency = tracesByName.reduce((s, r) => s + num(r.count_count), 0);
  const avgLatency = tracesWithLatency
    ? tracesByName.reduce((s, r) => s + (num(r.avg_latency) / 1000) * num(r.count_count), 0) / tracesWithLatency
    : 0;
  const evaluations = evaluators.reduce((s, e) => s + e.count, 0);
  // Judge scores are 0-1; exclude raw metrics logged as scores (latency_ms, token counts).
  const judgeScores = evaluators.filter((e) => e.avgScore >= 0 && e.avgScore <= 1);
  const judgeCount = judgeScores.reduce((s, e) => s + e.count, 0);
  const avgScore = judgeCount ? judgeScores.reduce((s, e) => s + e.avgScore * e.count, 0) / judgeCount : 0;

  return {
    kpi: {
      totalTraces,
      totalObservations,
      totalCost: +totalCost.toFixed(2),
      avgLatency: +avgLatency.toFixed(2),
      avgScore: +avgScore.toFixed(2),
      evaluations,
      models: models.length,
      tracesToday: dailyTrend[dailyTrend.length - 1]?.traces ?? 0,
    },
    dailyTrend,
    models,
    traceGroups,
    evaluators,
    timings,
    generatedAt: Date.now(),
  };
}

// Next.js data cache: persisted on Vercel, so the 60s TTL survives cold starts.
const getAiEngineerData = unstable_cache(fetchAiEngineerData, ["analytics-ai-engineer"], {
  revalidate: CACHE_TTL_S,
});

export async function GET(req: NextRequest) {
  return withApiSpan("/api/analytics/ai-engineer", req, () => handleGet());
}

async function handleGet() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const t0 = Date.now();
  try {
    const body = await getAiEngineerData();
    const cached = Date.now() - body.generatedAt > 2_000;
    return NextResponse.json(
      { ...body, cached, queryTimeMs: Date.now() - t0 },
      {
        headers: { "Cache-Control": `private, max-age=${CACHE_TTL_S}` },
      },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, queryTimeMs: Date.now() - t0 }, { status: 500 });
  }
}
