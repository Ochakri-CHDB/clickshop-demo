"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  BrainCircuit,
  CircleDollarSign,
  Gauge,
  Loader2,
  Pause,
  Radio,
  Scale,
  Sparkles,
  Timer,
  Workflow,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TimeSeriesChart } from "@/components/dashboard/TimeSeriesChart";
import { RankedTable } from "@/components/dashboard/RankedTable";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";

interface AiData {
  kpi: {
    totalTraces: number;
    totalObservations: number;
    totalCost: number;
    avgLatency: number;
    avgScore: number;
    evaluations: number;
    models: number;
    tracesToday: number;
  };
  dailyTrend: { date: string; traces: number; observations: number; cost: number }[];
  models: { model: string; tokens: number; cost: number; observations: number }[];
  traceGroups: { name: string; count: number; avgLatency: number; cost: number }[];
  evaluators: { name: string; count: number; avgScore: number }[];
  queryTimeMs: number;
}

const EMPTY: AiData = {
  kpi: { totalTraces: 0, totalObservations: 0, totalCost: 0, avgLatency: 0, avgScore: 0, evaluations: 0, models: 0, tracesToday: 0 },
  dailyTrend: [],
  models: [],
  traceGroups: [],
  evaluators: [],
  queryTimeMs: 0,
};

export default function AiEngineerWorkspace() {
  const [data, setData] = useState<AiData>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [waitedSec, setWaitedSec] = useState(0);

  const fetchData = useCallback(() => {
    fetch("/api/analytics/ai-engineer")
      .then((r) => r.json())
      .then((d) => {
        if (d?.kpi) {
          setData(d);
          setLoaded(true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 30000);
    return () => clearInterval(id);
  }, [fetchData, autoRefresh]);

  // Elapsed-time counter while the first load is in flight.
  useEffect(() => {
    if (loaded) return;
    const id = setInterval(() => setWaitedSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [loaded]);

  const costDonut = data.models.slice(0, 6).map((m) => ({ name: m.model, value: +m.cost.toFixed(3) }));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[--fg]">AI Engineer Workspace</h1>
          <p className="text-sm text-[--muted]">
            LLM observability from Langfuse Cloud — traces, tokens, costs &amp; LLM-as-judge evals (last 14 days)
          </p>
          <p className="mt-0.5 text-[11px] text-[--muted]" style={{ opacity: 0.75 }}>
            Source: Langfuse Metrics API (aggregated traces, models, scores), cached 60 s server-side + CDN
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              autoRefresh
                ? "border-sky-600/30 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-400 dark:hover:bg-sky-500/20"
                : "border-[--border] bg-[--surface-solid] text-[--muted] hover:bg-[--surface-hover]"
            }`}
          >
            {autoRefresh ? <Radio className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${loaded ? "bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-400" : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400"}`}>
            {loaded ? "Langfuse API" : "Loading"}
          </span>
        </div>
      </div>

      {!loaded ? (
        <div className="flex flex-col items-center justify-center gap-2 py-24 text-[--muted]">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" /> Querying Langfuse Cloud…
          </div>
          {waitedSec > 0 && (
            <p className="text-xs tabular-nums" style={{ opacity: 0.6 }}>
              {waitedSec}s elapsed{waitedSec >= 5 ? " (cold start, warming cache)" : ""}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard title="LLM Traces (14d)" value={data.kpi.totalTraces} icon={Workflow} />
              <KpiCard title="Traces Today" value={data.kpi.tracesToday} icon={Activity} />
              <KpiCard title="LLM Spend (14d)" value={`$${data.kpi.totalCost.toFixed(2)}`} icon={CircleDollarSign} />
              <KpiCard title="Avg Trace Latency" value={`${data.kpi.avgLatency}s`} icon={Timer} />
              <KpiCard title="Avg Judge Score" value={data.kpi.avgScore} icon={Scale} />
              <KpiCard title="Evaluations" value={data.kpi.evaluations} icon={Sparkles} />
              <KpiCard title="Observations (14d)" value={data.kpi.totalObservations} icon={Gauge} />
              <KpiCard title="Models In Use" value={data.kpi.models} icon={BrainCircuit} />
            </div>
            {data.queryTimeMs > 0 && (
              <p className="mt-1.5 text-right text-[9px] tabular-nums text-[--muted]" style={{ opacity: 0.5 }}>
                Langfuse API: {data.queryTimeMs}ms
              </p>
            )}
          </div>

          {/* Trends */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TimeSeriesChart
              title="Traces & Observations"
              subtitle="Daily volume across all agents and evaluators"
              data={data.dailyTrend}
              xKey="date"
              lines={[
                { key: "traces", color: "#38bdf8", label: "Traces" },
                { key: "observations", color: "#818cf8", label: "Observations" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
            <TimeSeriesChart
              title="Daily LLM Cost"
              subtitle="Total model spend per day ($)"
              data={data.dailyTrend}
              xKey="date"
              lines={[{ key: "cost", color: "#fbbf24", label: "Cost ($)" }]}
              type="bar"
              queryTimeMs={data.queryTimeMs}
            />
          </div>

          {/* Model usage */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <RankedTable
                title="Tokens & Cost by Model"
                data={data.models}
                columns={[
                  { key: "model", label: "Model" },
                  { key: "tokens", label: "Tokens", format: "number", align: "right" },
                  { key: "observations", label: "Generations", format: "number", align: "right" },
                  { key: "cost", label: "Cost ($)", align: "right" },
                ]}
                queryTimeMs={data.queryTimeMs}
              />
            </div>
            <DonutChart
              title="Cost Share by Model"
              data={costDonut}
              height={220}
              centerLabel="14d Spend"
              centerValue={`$${data.kpi.totalCost.toFixed(0)}`}
              queryTimeMs={data.queryTimeMs}
            />
          </div>

          {/* Traces by agent + evaluator scores */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankedTable
              title="Recent Traces by Agent / Pipeline"
              data={data.traceGroups}
              columns={[
                { key: "name", label: "Trace Name" },
                { key: "count", label: "Runs", format: "number", align: "right" },
                { key: "avgLatency", label: "Avg Latency (s)", align: "right" },
                { key: "cost", label: "Cost ($)", align: "right" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
            <RankedTable
              title="LLM-as-Judge Scores"
              data={data.evaluators}
              columns={[
                { key: "name", label: "Evaluator" },
                { key: "count", label: "Evals", format: "number", align: "right" },
                { key: "avgScore", label: "Avg Score", align: "right" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
          </div>
        </>
      )}

      <CopilotPanel persona="ai" />

      {data.queryTimeMs > 0 && (
        <p className="text-right text-[10px] tabular-nums text-[--muted]" style={{ opacity: 0.5 }}>
          Query: {data.queryTimeMs}ms
        </p>
      )}
    </div>
  );
}
