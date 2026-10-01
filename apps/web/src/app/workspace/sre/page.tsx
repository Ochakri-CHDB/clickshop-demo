"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  AlertTriangle,
  Gauge,
  Loader2,
  Pause,
  Radio,
  ScrollText,
  Server,
  Timer,
  Zap,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TimeSeriesChart } from "@/components/dashboard/TimeSeriesChart";
import { RankedTable } from "@/components/dashboard/RankedTable";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { LogSearch } from "@/components/dashboard/LogSearch";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";

const RANGES = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "1d", label: "24h" },
  { value: "7d", label: "7d" },
];

interface SreData {
  kpi: {
    totalRequests: number;
    errorRate: number;
    p50: number;
    p95: number;
    reqPerMin: number;
    totalLogs: number;
    errorLogs: number;
    services: number;
  };
  changes: { requests: number };
  requestTrend: { date: string; requests: number; errors: number }[];
  latencyTrend: { date: string; p50: number; p95: number }[];
  slowRoutes: { route: string; requests: number; p95: number; avgMs: number; errors: number }[];
  logSeverity: { name: string; value: number }[];
  logTrend: { date: string; errors: number; warnings: number; info: number }[];
  services: { service: string; spans: number; p95: number; errorRate: number; lastSeen: string }[];
  queryTimeMs: number;
}

const EMPTY: SreData = {
  kpi: { totalRequests: 0, errorRate: 0, p50: 0, p95: 0, reqPerMin: 0, totalLogs: 0, errorLogs: 0, services: 0 },
  changes: { requests: 0 },
  requestTrend: [],
  latencyTrend: [],
  slowRoutes: [],
  logSeverity: [],
  logTrend: [],
  services: [],
  queryTimeMs: 0,
};

export default function SreWorkspace() {
  const [data, setData] = useState<SreData>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [range, setRange] = useState("1d");

  const fetchData = useCallback(() => {
    fetch(`/api/analytics/sre?range=${range}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.kpi) {
          setData(d);
          setLoaded(true);
        }
      })
      .catch(() => {});
  }, [range]);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 15000);
    return () => clearInterval(id);
  }, [fetchData, autoRefresh]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[--fg]">SRE Workspace</h1>
          <p className="text-sm text-[--muted]">
            App health from ClickStack OTel data — traces, logs &amp; metrics in ClickHouse
          </p>
          <p className="mt-0.5 text-[11px] text-[--muted]" style={{ opacity: 0.75 }}>
            Source: live otel_traces / otel_logs tables in the demo ClickHouse, aggregated on the fly (no cache)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-lg border border-[--border] bg-[--surface-solid] px-3 py-1.5 text-xs text-[--muted-fg] focus:border-rose-500 focus:outline-none"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              autoRefresh
                ? "border-rose-600/30 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
                : "border-[--border] bg-[--surface-solid] text-[--muted] hover:bg-[--surface-hover]"
            }`}
          >
            {autoRefresh ? <Radio className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${loaded ? "bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-400" : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400"}`}>
            {loaded ? "otel_traces · otel_logs" : "Loading"}
          </span>
        </div>
      </div>

      {!loaded ? (
        <div className="flex items-center justify-center gap-2 py-24 text-[--muted]">
          <Loader2 className="h-5 w-5 animate-spin" /> Querying ClickHouse OTel tables…
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard title="API Requests" value={data.kpi.totalRequests} icon={Zap} change={data.changes.requests} />
              <KpiCard title="Error Rate" value={`${data.kpi.errorRate}%`} icon={AlertTriangle} />
              <KpiCard title="Latency p50" value={`${data.kpi.p50} ms`} icon={Timer} />
              <KpiCard title="Latency p95" value={`${data.kpi.p95} ms`} icon={Gauge} />
              <KpiCard title="Throughput" value={`${data.kpi.reqPerMin}/min`} icon={Activity} />
              <KpiCard title="Log Volume" value={data.kpi.totalLogs} icon={ScrollText} />
              <KpiCard title="Error Logs" value={data.kpi.errorLogs} icon={AlertTriangle} />
              <KpiCard title="Services Reporting" value={data.kpi.services} icon={Server} />
            </div>
            {data.queryTimeMs > 0 && (
              <p className="mt-1.5 text-right text-[9px] tabular-nums text-[--muted]" style={{ opacity: 0.5 }}>
                ClickHouse Query: {data.queryTimeMs}ms
              </p>
            )}
          </div>

          {/* Full-text log search */}
          <LogSearch />

          {/* Requests + Latency trends */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TimeSeriesChart
              title="Request Volume"
              subtitle="Server spans and errors over time (clickshop services)"
              data={data.requestTrend}
              xKey="date"
              lines={[
                { key: "requests", color: "#fb7185", label: "Requests" },
                { key: "errors", color: "#f87171", label: "Errors" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
            <TimeSeriesChart
              title="API Latency"
              subtitle="p50 / p95 request duration (ms)"
              data={data.latencyTrend}
              xKey="date"
              lines={[
                { key: "p50", color: "#34d399", label: "p50 (ms)" },
                { key: "p95", color: "#fbbf24", label: "p95 (ms)" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
          </div>

          {/* Logs trend + severity donut */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <TimeSeriesChart
                title="Log Volume by Severity"
                subtitle="ERROR / WARN / INFO from otel_logs"
                data={data.logTrend}
                xKey="date"
                lines={[
                  { key: "errors", color: "#f87171", label: "ERROR" },
                  { key: "warnings", color: "#fbbf24", label: "WARN" },
                  { key: "info", color: "#60a5fa", label: "INFO" },
                ]}
                type="bar"
                queryTimeMs={data.queryTimeMs}
              />
            </div>
            <DonutChart
              title="Logs by Severity"
              data={data.logSeverity}
              height={220}
              centerLabel="Logs"
              centerValue={data.kpi.totalLogs.toLocaleString("en-US")}
              queryTimeMs={data.queryTimeMs}
            />
          </div>

          {/* Slow routes + services */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankedTable
              title="Slowest API Routes (p95)"
              data={data.slowRoutes}
              columns={[
                { key: "route", label: "Route" },
                { key: "p95", label: "p95 (ms)", format: "number", align: "right" },
                { key: "avgMs", label: "Avg (ms)", format: "number", align: "right" },
                { key: "requests", label: "Requests", format: "number", align: "right" },
                { key: "errors", label: "Errors", format: "number", align: "right" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
            <RankedTable
              title="Instrumented Services"
              data={data.services}
              columns={[
                { key: "service", label: "Service" },
                { key: "spans", label: "Spans", format: "number", align: "right" },
                { key: "p95", label: "p95 (ms)", format: "number", align: "right" },
                { key: "errorRate", label: "Error %", format: "percent", align: "right" },
                { key: "lastSeen", label: "Last Seen", align: "right" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
          </div>
        </>
      )}

      <CopilotPanel persona="sre" />

      {data.queryTimeMs > 0 && (
        <p className="text-right text-[10px] tabular-nums text-[--muted]" style={{ opacity: 0.5 }}>
          Query: {data.queryTimeMs}ms
        </p>
      )}
    </div>
  );
}
