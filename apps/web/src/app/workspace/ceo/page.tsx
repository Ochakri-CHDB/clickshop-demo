"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  TrendingUp,
  Users,
  CreditCard,
  Star,
  Package,
  Loader2,
  Sparkles,
  Radio,
  Pause,
  CalendarDays,
  Hash,
  Code2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TimeSeriesChart } from "@/components/dashboard/TimeSeriesChart";
import { RankedTable } from "@/components/dashboard/RankedTable";
import { EuropeMap } from "@/components/dashboard/EuropeMap";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { HeatmapChart } from "@/components/dashboard/HeatmapChart";
import { GaugeChart } from "@/components/dashboard/GaugeChart";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import * as mock from "@/lib/mock-data";

const RANGES = [
  { value: "today", label: "Today" },
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "1d", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

export default function CeoWorkspace() {
  const [data, setData] = useState({
    kpi: mock.kpiData,
    revenue: mock.revenueTrend,
    conversion: mock.conversionTrend,
    regions: mock.topRegions,
    categories: mock.topCategories,
    payments: mock.paymentTrend,
    hourly: [] as { hour: string; orders: number; revenue: number }[],
    heatmap: [] as { day: string; hour: number; value: number }[],
    geoData: [] as { code: string; name: string; revenue: number; orders: number }[],
    categoryDonut: [] as { name: string; value: number }[],
    ordersPerDay: [] as { day: string; orders: number; revenue: number }[],
    todayOrders: 0,
    allTimeOrders: 0,
    allTimeRevenue: 0,
    channels: [] as { name: string; value: number }[],
    queryTimeMs: 0,
  });
  const [live, setLive] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [range, setRange] = useState("7d");
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [recoQueries, setRecoQueries] = useState<{ name: string; sql: string }[]>([]);
  const [showQueries, setShowQueries] = useState(false);
  const [recoLoading, setRecoLoading] = useState(false);
  const [changes, setChanges] = useState({ revenue: 0, orders: 0 });
  const [filterCountry, setFilterCountry] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  const fetchRecommendations = () => {
    setRecoLoading(true);
    fetch("/api/analytics/recommendations?persona=ceo&source=workspace-ceo")
      .then((r) => r.json())
      .then((d) => {
        if (d.recommendations?.length) setRecommendations(d.recommendations);
        if (d.changes) setChanges(d.changes);
        if (d.queries) setRecoQueries(d.queries);
      })
      .catch(() => {})
      .finally(() => setRecoLoading(false));
  };

  const fetchData = useCallback(() => {
    const params = new URLSearchParams({ range });
    if (filterCountry) params.set("country", filterCountry);
    if (filterCategory) params.set("category", filterCategory);
    fetch(`/api/analytics/ceo?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.kpi) {
          setData(d);
          setLive(true);
          if (d.changes) setChanges(d.changes);
        }
      })
      .catch(() => {});
  }, [range, filterCountry, filterCategory]);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 2000);
    return () => clearInterval(id);
  }, [fetchData, autoRefresh]);

  const totalRevenueDonut = data.categoryDonut.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[--fg]">CEO Workspace</h1>
          <p className="text-sm text-[--muted]">
            Executive overview — {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <p className="mt-0.5 text-[11px] text-[--muted]" style={{ opacity: 0.75 }}>
            Source: live ClickHouse queries on event streams (order_events, checkout_events, payment_events) and Postgres tables replicated by ClickPipes CDC
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value)}
            className="rounded-lg border border-[--border] bg-[--surface-solid] px-3 py-1.5 text-xs text-[--muted-fg] focus:border-[--brand] focus:outline-none"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              autoRefresh
                ? "border-emerald-600/30 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
                : "border-[--border] bg-[--surface-solid] text-[--muted] hover:bg-[--surface-hover]"
            }`}
          >
            {autoRefresh ? <Radio className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${live ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400" : "bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400"}`}>
            {live ? "ClickHouse" : "Demo data"}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} className="rounded-lg border border-[--border] bg-[--surface-solid] px-3 py-1.5 text-xs text-[--muted-fg] focus:border-[--brand] focus:outline-none">
          <option value="">All Countries</option>
          {["US","DE","FR","UK","ES","IT","NL","CA","JP","BR","AU","IN","MX","MA","PL","SE"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="rounded-lg border border-[--border] bg-[--surface-solid] px-3 py-1.5 text-xs text-[--muted-fg] focus:border-[--brand] focus:outline-none">
          <option value="">All Categories</option>
          {["Electronics","Clothing","Home","Beauty","Sports","Food","Books","Toys"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        {(filterCountry || filterCategory) && (
          <button onClick={() => { setFilterCountry(""); setFilterCategory(""); }} className="rounded-lg border border-[--border] px-3 py-1.5 text-xs text-[--muted-fg] hover:text-[--fg]">Clear</button>
        )}
      </div>

      {/* Executive Summary */}
      <div className="rounded-xl border border-amber-600/20 bg-amber-50 p-4 dark:bg-amber-500/5">
        <div className="flex items-start gap-3">
          {recoLoading ? (
            <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-amber-600 dark:text-amber-400" />
          ) : (
            <Sparkles className="mt-0.5 h-5 w-5 text-amber-600 dark:text-amber-400" />
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                Executive Summary
              </h3>
              <button
                onClick={fetchRecommendations}
                disabled={recoLoading}
                className="flex items-center gap-1.5 rounded-lg border border-amber-600/30 bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 disabled:opacity-50 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
              >
                {recoLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {recoLoading ? "Analyzing..." : recommendations.length > 0 ? "Refresh" : "Generate"}
              </button>
            </div>
            {recoLoading ? (
              <p className="mt-2 text-sm text-amber-700/70 dark:text-amber-200/60">Agent querying ClickHouse...</p>
            ) : recommendations.length > 0 ? (
              <>
                <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-200/80">
                  {recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
                {recoQueries.length > 0 && (
                  <div className="mt-3 border-t border-amber-600/20 pt-2">
                    <button
                      onClick={() => setShowQueries(!showQueries)}
                      className="flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:underline"
                    >
                      <Code2 className="h-3 w-3" />
                      {showQueries ? "Hide" : "Show"} executed queries ({recoQueries.length})
                      {showQueries ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {showQueries && (
                      <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                        {recoQueries.map((q, i) => (
                          <div key={i} className="rounded-lg bg-amber-900/10 dark:bg-amber-950/40 px-3 py-2">
                            <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mb-1">{q.name}</p>
                            <pre className="text-[10px] text-amber-800/80 dark:text-amber-300/60 whitespace-pre-wrap break-all font-mono leading-relaxed">{q.sql}</pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm text-amber-700/70 dark:text-amber-200/60">Click Generate to get 5 strategic insights from your live ClickHouse data.</p>
            )}
          </div>
        </div>
      </div>

      {/* KPI grid */}
      <div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard title={`Revenue (${RANGES.find(r => r.value === range)?.label ?? range})`} value={data.kpi.totalRevenue} format="currency" icon={DollarSign} change={changes.revenue} />
          <KpiCard title={`Orders (${RANGES.find(r => r.value === range)?.label ?? range})`} value={data.kpi.totalOrders} format="number" icon={CalendarDays} change={changes.orders} />
          <KpiCard title="Total Orders" value={data.allTimeOrders || data.kpi.totalOrders} format="number" icon={Hash} subtitle="All time" />
          <KpiCard title="Avg Order Value" value={data.kpi.avgOrderValue} format="currency" icon={Package} />
          <KpiCard title="Conversion Rate" value={data.kpi.conversionRate} format="percent" icon={TrendingUp} />
          <KpiCard title="Failed Payments" value={data.kpi.failedPayments} format="number" icon={CreditCard} />
          <KpiCard title="Active Customers" value={data.kpi.activeCustomers} format="number" icon={Users} />
          <KpiCard title="VIP Impacted" value={data.kpi.vipCustomersImpacted} format="number" icon={Star} subtitle="Customers with failed payments" />
        </div>
        {data.queryTimeMs > 0 && (
          <p className="mt-1.5 text-right text-[9px] tabular-nums text-[--muted]" style={{ opacity: 0.5 }}>KPI Query: {data.queryTimeMs}ms</p>
        )}
      </div>

      {/* Map + Revenue Donut + Conversion Gauge */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EuropeMap
            title="Revenue by Geography"
            subtitle="Hover for breakdown by country"
            data={data.geoData}
            queryTimeMs={data.queryTimeMs}
          />
        </div>
        <div className="space-y-4">
          <DonutChart
            title="Revenue by Category"
            data={data.categoryDonut.length ? data.categoryDonut : mock.topCategories.map((c) => ({ name: c.category, value: c.revenue }))}
            centerLabel="Total"
            centerValue={`€${(totalRevenueDonut || data.kpi.totalRevenue).toLocaleString()}`}
            queryTimeMs={data.queryTimeMs}
          />
          <GaugeChart
            title="Conversion Rate"
            value={data.kpi.conversionRate}
            max={10}
            thresholds={{ good: 3, warn: 5 }}
            queryTimeMs={data.queryTimeMs}
          />
        </div>
      </div>

      {/* Revenue Trend + Orders Heatmap */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TimeSeriesChart
          title="Revenue Trend"
          data={data.revenue}
          xKey="date"
          lines={[{ key: "revenue", color: "#FAFF69", label: "Revenue (€)" }]}
          queryTimeMs={data.queryTimeMs}
        />
        {data.heatmap.length > 0 ? (
          <HeatmapChart
            title="Orders Heatmap"
            subtitle="Orders by day of week × hour"
            data={data.heatmap}
            queryTimeMs={data.queryTimeMs}
          />
        ) : (
          <TimeSeriesChart
            title="Conversion Rate Trend"
            data={data.conversion}
            xKey="date"
            lines={[{ key: "rate", color: "#34d399", label: "Conversion %" }]}
            type="line"
            queryTimeMs={data.queryTimeMs}
          />
        )}
      </div>

      {/* Orders per Day (sparkline bar) + Payment Health */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.ordersPerDay.length > 0 && (
          <TimeSeriesChart
            title="Orders per Day (Last 7 Days)"
            data={data.ordersPerDay}
            xKey="day"
            lines={[
              { key: "orders", color: "#818cf8", label: "Orders" },
              { key: "revenue", color: "#FAFF69", label: "Revenue (€)" },
            ]}
            type="bar"
            queryTimeMs={data.queryTimeMs}
          />
        )}
        <TimeSeriesChart
          title="Payment Success vs Failures"
          data={data.payments}
          xKey="date"
          lines={[
            { key: "success", color: "#34d399", label: "Success" },
            { key: "failed", color: "#f87171", label: "Failed" },
          ]}
          queryTimeMs={data.queryTimeMs}
        />
      </div>

      {/* Channel + Hourly */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.channels.length > 0 && (
          <DonutChart
            title="Revenue by Channel"
            data={data.channels}
            centerLabel="Channels"
            centerValue={String(data.channels.length)}
            queryTimeMs={data.queryTimeMs}
          />
        )}
        {data.hourly.length > 0 && (
          <TimeSeriesChart
            title="Orders by Hour (Today)"
            data={data.hourly}
            xKey="hour"
            lines={[
              { key: "orders", color: "#818cf8", label: "Orders" },
              { key: "revenue", color: "#FAFF69", label: "Revenue (€)" },
            ]}
            type="bar"
            queryTimeMs={data.queryTimeMs}
          />
        )}
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RankedTable
          title="Top Geographies"
          data={data.regions}
          columns={[
            { key: "region", label: "Region" },
            { key: "revenue", label: "Revenue", format: "currency", align: "right" },
            { key: "orders", label: "Orders", format: "number", align: "right" },
          ]}
          queryTimeMs={data.queryTimeMs}
        />
        <RankedTable
          title="Top Product Categories"
          data={data.categories}
          columns={[
            { key: "category", label: "Category" },
            { key: "revenue", label: "Revenue", format: "currency", align: "right" },
            { key: "share", label: "Share", format: "percent", align: "right" },
          ]}
          queryTimeMs={data.queryTimeMs}
        />
      </div>

      <CopilotPanel persona="ceo" />

      {data.queryTimeMs > 0 && (
        <p className="text-right text-[10px] tabular-nums text-[--muted]" style={{ opacity: 0.5 }}>
          Query: {data.queryTimeMs}ms
        </p>
      )}
    </div>
  );
}
