"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  Users,
  CreditCard,
  AlertCircle,
  Package,
  Loader2,
  Sparkles,
  Radio,
  Pause,
  Search,
  Edit3,
  Check,
  X,
  BarChart3,
  ClipboardList,
  Target,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Code2,
  ChevronDown,
  ChevronUp,
  FileUp,
  FileText,
  CheckCircle2,
  Database,
  Trash2,
} from "lucide-react";
import { TimeSeriesChart } from "@/components/dashboard/TimeSeriesChart";
import { RankedTable } from "@/components/dashboard/RankedTable";
import { FunnelChart } from "@/components/dashboard/FunnelChart";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";
import { FeedbackSearch } from "@/components/dashboard/FeedbackSearch";
import * as mock from "@/lib/mock-data";

interface Transaction {
  id: number;
  status: string;
  total_amount: number;
  payment_method: string;
  country: string;
  channel: string;
  created_at: string;
  customer_id: number;
  customer_name: string;
  customer_email: string;
  customer_tier: string;
  customer_country: string;
}

type SalesTab = "analytics" | "transactions" | "contracts";

interface ExtractedContract {
  customer: { full_name: string; email: string | null; country: string; tier: string; is_vip: boolean };
  order: { status: string; total_amount: number; payment_method: string; country: string; channel: string };
  items: { product_name: string; category: string; quantity: number; unit_price: number; total_price: number }[];
  payment: { status: string; provider: string | null };
  summary: string;
}

const RANGES = [
  { value: "today", label: "Today" },
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "1d", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = React.useState(target);
  const prev = React.useRef(target);
  React.useEffect(() => {
    const from = prev.current;
    if (from === target) return;
    const start = performance.now();
    let raf: number;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (target - from) * ease));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    prev.current = target;
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

function formatFull(value: number, prefix = ""): string {
  return `${prefix}${Math.round(value).toLocaleString("en-US")}`;
}

function SalesKpi({ label, value, change, prefix = "", suffix = "", icon: Icon }: {
  label: string; value: string | number; change?: number; prefix?: string; suffix?: string;
  icon: typeof DollarSign;
}) {
  const numericValue = typeof value === "number" ? value : 0;
  const animated = useAnimatedNumber(numericValue);
  const formatted = typeof value === "number"
    ? `${formatFull(animated, prefix)}${suffix}`
    : value;

  return (
    <div
      className="group rounded-xl border border-[--border] bg-[--surface] px-3.5 py-3 transition-all duration-200 hover:border-[--muted-fg]/25 hover:shadow-md"
      style={{ boxShadow: "0 1px 3px var(--card-shadow)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[--muted]" title={label}>
          {label}
        </p>
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-[--muted] transition-colors duration-200 group-hover:text-emerald-500" />
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="truncate text-xl font-bold leading-tight text-[--fg] tabular-nums">{formatted}</p>
        {change !== undefined && (
          <span className={`flex-shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums ${change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[--muted-fg]">{label}</span>
        <span className="text-xs font-semibold text-[--fg] tabular-nums">€{value.toLocaleString()}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-[--surface-hover]">
        <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

const CATEGORY_COLORS = ["#FAFF69", "#818cf8", "#34d399", "#f87171", "#60a5fa", "#fbbf24", "#a78bfa", "#2dd4bf"];
const CATEGORY_COLORS_LIGHT = ["#8e9018", "#4f46e5", "#059669", "#dc2626", "#2563eb", "#d97706", "#7c3aed", "#0d9488"];

export default function SalesWorkspace() {
  const [tab, setTab] = useState<SalesTab>("analytics");
  const [data, setData] = useState({
    kpi: mock.kpiData,
    revenue: mock.revenueTrend,
    regions: mock.topRegions,
    products: mock.topProducts,
    customers: mock.topCustomers,
    failures: mock.orderFailures,
    funnel: mock.cartDropoff,
    payments: mock.paymentTrend,
    deviceBreakdown: [] as { name: string; value: number }[],
    payMethodBreakdown: [] as { name: string; value: number }[],
    hourlyRevenue: [] as { hour: string; revenue: number; orders: number }[],
    categoryDetail: [] as { category: string; revenue: number; orders: number; units: number; avgValue: number }[],
    orderStatusBreakdown: [] as { name: string; value: number }[],
    aovTrend: [] as { date: string; aov: number }[],
    channelBreakdown: [] as { name: string; value: number }[],
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
  const [fCountry, setFCountry] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fChannel, setFChannel] = useState("");
  const [fDevice, setFDevice] = useState("");
  const [fPayment, setFPayment] = useState("");
  const [fStatus, setFStatus] = useState("");

  const fetchRecommendations = () => {
    setRecoLoading(true);
    fetch("/api/analytics/recommendations?persona=sales&source=workspace-sales")
      .then((r) => r.json())
      .then((d) => {
        if (d.recommendations?.length) setRecommendations(d.recommendations);
        if (d.changes) setChanges(d.changes);
        if (d.queries) setRecoQueries(d.queries);
      })
      .catch(() => {})
      .finally(() => setRecoLoading(false));
  };
  const [txSearch, setTxSearch] = useState("");
  const [txStatus, setTxStatus] = useState("");
  const [txRows, setTxRows] = useState<Transaction[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txEditId, setTxEditId] = useState<number | null>(null);
  const [txEditData, setTxEditData] = useState<Partial<Transaction>>({});
  const [txSaving, setTxSaving] = useState(false);
  const [txMsg, setTxMsg] = useState<string | null>(null);
  const [txInitLoaded, setTxInitLoaded] = useState(false);

  const [contractFile, setContractFile] = useState<File | null>(null);
  const [contractExtracting, setContractExtracting] = useState(false);
  const [contractData, setContractData] = useState<ExtractedContract | null>(null);
  const [contractInserting, setContractInserting] = useState(false);
  const [contractMsg, setContractMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [contractInserted, setContractInserted] = useState(false);

  const handleContractUpload = async () => {
    if (!contractFile) return;
    setContractExtracting(true);
    setContractMsg(null);
    setContractData(null);
    setContractInserted(false);
    try {
      const formData = new FormData();
      formData.append("file", contractFile);
      const res = await fetch("/api/contracts/extract", { method: "POST", body: formData });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Extraction failed");
      if (!d.extracted) throw new Error("No data extracted from document");
      const e = d.extracted;
      const safe: ExtractedContract = {
        customer: {
          full_name: String(e.customer?.full_name ?? e.customer?.name ?? ""),
          email: e.customer?.email ? String(e.customer.email) : null,
          country: String(e.customer?.country ?? ""),
          tier: String(e.customer?.tier ?? "Standard"),
          is_vip: Boolean(e.customer?.is_vip),
        },
        order: {
          status: String(e.order?.status ?? "pending"),
          total_amount: Number(e.order?.total_amount ?? e.total_amount ?? 0),
          payment_method: String(e.order?.payment_method ?? e.payment_method ?? ""),
          country: String(e.order?.country ?? e.customer?.country ?? ""),
          channel: String(e.order?.channel ?? "web"),
        },
        items: Array.isArray(e.items) ? e.items.map((it: Record<string, unknown>) => ({
          product_name: String(it.product_name ?? it.name ?? ""),
          category: String(it.category ?? ""),
          quantity: Number(it.quantity ?? 1),
          unit_price: Number(it.unit_price ?? 0),
          total_price: Number(it.total_price ?? 0),
        })) : [],
        payment: {
          status: String(e.payment?.status ?? "pending"),
          provider: e.payment?.provider ? String(e.payment.provider) : null,
        },
        summary: typeof e.summary === "string" ? e.summary : JSON.stringify(e.summary ?? ""),
      };
      setContractData(safe);
    } catch (err) {
      setContractMsg({ type: "error", text: (err as Error).message });
    } finally {
      setContractExtracting(false);
    }
  };

  const handleContractInsert = async () => {
    if (!contractData) return;
    setContractInserting(true);
    setContractMsg(null);
    try {
      const res = await fetch("/api/contracts/insert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contractData),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Insert failed");
      setContractInserted(true);
      setContractMsg({ type: "success", text: `Inserted: Customer #${d.customerId}, Order #${d.orderId}, ${d.itemsInserted} item(s)` });
    } catch (err) {
      setContractMsg({ type: "error", text: (err as Error).message });
    } finally {
      setContractInserting(false);
    }
  };

  const resetContract = () => {
    setContractFile(null);
    setContractData(null);
    setContractMsg(null);
    setContractInserted(false);
  };

  const searchTransactions = useCallback((search?: string, status?: string) => {
    setTxLoading(true);
    const s = search ?? txSearch;
    const st = status ?? txStatus;
    const params = new URLSearchParams();
    if (s) params.set("search", s);
    if (st) params.set("status", st);
    params.set("limit", "20");
    fetch(`/api/transactions?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.rows) { setTxRows(d.rows); setTxTotal(d.total); }
      })
      .catch(() => {})
      .finally(() => setTxLoading(false));
  }, [txSearch, txStatus]);

  useEffect(() => {
    if (tab === "transactions" && !txInitLoaded) {
      searchTransactions("", "");
      setTxInitLoaded(true);
    }
  }, [tab, txInitLoaded, searchTransactions]);

  const startEdit = (tx: Transaction) => {
    setTxEditId(tx.id);
    setTxEditData({
      status: tx.status,
      total_amount: tx.total_amount,
      payment_method: tx.payment_method,
      country: tx.country,
      customer_name: tx.customer_name,
      customer_email: tx.customer_email,
      customer_tier: tx.customer_tier,
    });
  };

  const saveEdit = async () => {
    if (!txEditId) return;
    setTxSaving(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: txEditId, updates: txEditData }),
      });
      const d = await res.json();
      if (d.ok) {
        setTxMsg("Saved");
        setTimeout(() => setTxMsg(null), 2000);
        setTxEditId(null);
        searchTransactions();
      } else {
        setTxMsg(`Error: ${d.error}`);
      }
    } catch (err) {
      setTxMsg(`Error: ${(err as Error).message}`);
    }
    setTxSaving(false);
  };

  const fetchData = useCallback(() => {
    const params = new URLSearchParams({ range });
    if (fCountry) params.set("country", fCountry);
    if (fCategory) params.set("category", fCategory);
    if (fChannel) params.set("channel", fChannel);
    if (fDevice) params.set("device", fDevice);
    if (fPayment) params.set("payment", fPayment);
    if (fStatus) params.set("status", fStatus);
    fetch(`/api/analytics/sales?${params}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.kpi) {
          setData(d);
          setLive(true);
          if (d.changes) setChanges(d.changes);
        }
      })
      .catch(() => {});
  }, [range, fCountry, fCategory, fChannel, fDevice, fPayment, fStatus]);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 2000);
    return () => clearInterval(id);
  }, [fetchData, autoRefresh]);

  const maxCatRevenue = data.categoryDetail.length ? Math.max(...data.categoryDetail.map((c) => c.revenue)) : 1;

  return (
    <div className="space-y-4">
      {/* Header with tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-bold text-[--fg]">Sales Workspace</h1>
            <p className="text-sm text-[--muted]">
              Revenue &amp; pipeline — {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <p className="mt-0.5 text-[11px] text-[--muted]" style={{ opacity: 0.75 }}>
              Source: live ClickHouse queries on event streams (order_events, payment_events, funnel events) and Postgres tables replicated by ClickPipes CDC
            </p>
          </div>
          <div className="flex rounded-lg border border-[--border] bg-[--surface-solid] p-0.5">
            <button
              onClick={() => setTab("analytics")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "analytics" ? "bg-emerald-500 text-white" : "text-[--muted] hover:text-[--fg]"
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              Pipeline Analytics
            </button>
            <button
              onClick={() => setTab("transactions")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "transactions" ? "bg-emerald-500 text-white" : "text-[--muted] hover:text-[--fg]"
              }`}
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Transactions
            </button>
            <button
              onClick={() => setTab("contracts")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "contracts" ? "bg-emerald-500 text-white" : "text-[--muted] hover:text-[--fg]"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Contract Import
            </button>
          </div>
        </div>
        {tab === "analytics" && (
          <div className="flex items-center gap-2">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="rounded-lg border border-[--border] bg-[--surface-solid] px-3 py-1.5 text-xs text-[--muted-fg] focus:border-emerald-500 focus:outline-none"
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
        )}
      </div>

      {/* ─── Analytics Tab ─── */}
      {tab === "analytics" && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { val: fCountry, set: setFCountry, label: "Country", opts: ["US","DE","FR","UK","ES","IT","NL","CA","JP","BR","AU","IN","MX","MA","PL","SE"] },
              { val: fCategory, set: setFCategory, label: "Category", opts: ["Electronics","Clothing","Home","Beauty","Sports","Food","Books","Toys"] },
              { val: fChannel, set: setFChannel, label: "Channel", opts: ["web","mobile","marketplace","store"] },
              { val: fDevice, set: setFDevice, label: "Device", opts: ["desktop","mobile","tablet"] },
              { val: fPayment, set: setFPayment, label: "Payment", opts: ["credit_card","paypal","apple_pay","bank_transfer"] },
              { val: fStatus, set: setFStatus, label: "Status", opts: ["completed","shipped","pending","cancelled"] },
            ].map(({ val, set, label, opts }) => (
              <select key={label} value={val} onChange={(e) => set(e.target.value)} className="rounded-lg border border-[--border] bg-[--surface-solid] px-2.5 py-1.5 text-xs text-[--muted-fg] focus:border-emerald-500 focus:outline-none">
                <option value="">{label}</option>
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ))}
            {(fCountry || fCategory || fChannel || fDevice || fPayment || fStatus) && (
              <button onClick={() => { setFCountry(""); setFCategory(""); setFChannel(""); setFDevice(""); setFPayment(""); setFStatus(""); }} className="rounded-lg border border-[--border] px-2.5 py-1.5 text-xs text-[--muted-fg] hover:text-[--fg]">Clear</button>
            )}
          </div>

          {/* Sales Insights */}
          <div className="rounded-xl border border-emerald-600/20 bg-emerald-50 p-4 dark:bg-emerald-500/5">
            <div className="flex items-start gap-3">
              {recoLoading ? (
                <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Sparkles className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    Sales Recommendations
                  </h3>
                  <button
                    onClick={fetchRecommendations}
                    disabled={recoLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                  >
                    {recoLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {recoLoading ? "Analyzing..." : recommendations.length > 0 ? "Refresh" : "Generate"}
                  </button>
                </div>
                {recoLoading ? (
                  <p className="mt-2 text-sm text-emerald-700/70 dark:text-emerald-200/60">Agent querying ClickHouse...</p>
                ) : recommendations.length > 0 ? (
                  <>
                    <ol className="mt-2 space-y-1 text-sm text-emerald-900 dark:text-emerald-200/70">
                      {recommendations.map((r, i) => (
                        <li key={i}>{i + 1}. {r}</li>
                      ))}
                    </ol>
                    {recoQueries.length > 0 && (
                      <div className="mt-3 border-t border-emerald-600/20 pt-2">
                        <button
                          onClick={() => setShowQueries(!showQueries)}
                          className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          <Code2 className="h-3 w-3" />
                          {showQueries ? "Hide" : "Show"} executed queries ({recoQueries.length})
                          {showQueries ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </button>
                        {showQueries && (
                          <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
                            {recoQueries.map((q, i) => (
                              <div key={i} className="rounded-lg bg-emerald-900/10 dark:bg-emerald-950/40 px-3 py-2">
                                <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mb-1">{q.name}</p>
                                <pre className="text-[10px] text-emerald-800/80 dark:text-emerald-300/60 whitespace-pre-wrap break-all font-mono leading-relaxed">{q.sql}</pre>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-sm text-emerald-700/70 dark:text-emerald-200/60">Click Generate to get 5 data-driven sales recommendations from your live pipeline.</p>
                )}
              </div>
            </div>
          </div>

          {/* Customer feedback search (index strategy demo) */}
          <FeedbackSearch accent="emerald" />

          {/* Sales KPI strip */}
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SalesKpi label="Pipeline Revenue" value={data.kpi.totalRevenue} prefix="€" icon={DollarSign} change={changes.revenue} />
              <SalesKpi label="Orders Closed" value={data.kpi.totalOrders} icon={ShoppingCart} change={changes.orders} />
              <SalesKpi label="Avg Deal Size" value={data.kpi.avgOrderValue} prefix="€" icon={Target} />
              <SalesKpi label="Conversion" value={`${data.kpi.conversionRate}%`} icon={Percent} />
              <SalesKpi label="Active Accounts" value={data.kpi.activeCustomers} icon={Users} />
              <SalesKpi label="Failed Payments" value={data.kpi.failedPayments} icon={CreditCard} />
              <SalesKpi label="VIP at Risk" value={data.kpi.vipCustomersImpacted} icon={AlertCircle} />
              <SalesKpi label="Top Category" value={data.kpi.topCategory} icon={Package} />
            </div>
            {data.queryTimeMs > 0 && (
              <p className="mt-1.5 text-right text-[9px] tabular-nums text-[--muted]" style={{ opacity: 0.5 }}>KPI Query: {data.queryTimeMs}ms</p>
            )}
          </div>

          {/* Revenue trend + AOV trend side by side */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TimeSeriesChart
              title="Revenue Pipeline"
              subtitle="Revenue over time with order volume"
              data={data.revenue}
              xKey="date"
              lines={[
                { key: "revenue", color: "#34d399", label: "Revenue (€)" },
                { key: "orders", color: "#818cf8", label: "Orders" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
            {data.aovTrend.length > 0 ? (
              <TimeSeriesChart
                title="Average Deal Size Trend"
                subtitle="Average order value evolution"
                data={data.aovTrend}
                xKey="date"
                lines={[{ key: "aov", color: "#fbbf24", label: "Avg Order Value (€)" }]}
                type="line"
                queryTimeMs={data.queryTimeMs}
              />
            ) : (
              <FunnelChart title="Sales Funnel" subtitle="Conversion at each stage" data={data.funnel} />
            )}
          </div>

          {/* Funnel + Category Revenue Breakdown */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <FunnelChart title="Sales Funnel" subtitle="Drop-off at each pipeline stage" data={data.funnel} queryTimeMs={data.queryTimeMs} />

            <div className="rounded-xl border border-[--border] bg-[--surface] p-4 transition-all duration-200 hover:shadow-md" style={{ boxShadow: "0 1px 3px var(--card-shadow)" }}>
              <h3 className="text-sm font-semibold text-[--fg]">Revenue by Category</h3>
              <p className="mb-3 mt-0.5 text-xs text-[--muted]">Performance ranking by product line</p>
              <div className="space-y-3">
                {data.categoryDetail.map((cat, i) => (
                  <ProgressBar
                    key={cat.category}
                    label={cat.category}
                    value={cat.revenue}
                    max={maxCatRevenue}
                    color={(typeof window !== "undefined" && document.documentElement.classList.contains("light")
                      ? CATEGORY_COLORS_LIGHT
                      : CATEGORY_COLORS)[i % CATEGORY_COLORS.length]}
                  />
                ))}
                {data.categoryDetail.length === 0 && (
                  <p className="py-8 text-center text-xs text-[--muted]">No category data available</p>
                )}
              </div>
            </div>
          </div>

          {/* Donuts: Device + Payment Method + Channel + Order Status */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {data.deviceBreakdown.length > 0 && (
              <DonutChart title="By Device" data={data.deviceBreakdown} height={180} centerLabel="Device" centerValue={String(data.deviceBreakdown.length)} queryTimeMs={data.queryTimeMs} />
            )}
            {data.payMethodBreakdown.length > 0 && (
              <DonutChart title="By Payment" data={data.payMethodBreakdown} height={180} centerLabel="Method" centerValue={String(data.payMethodBreakdown.length)} queryTimeMs={data.queryTimeMs} />
            )}
            {data.channelBreakdown.length > 0 && (
              <DonutChart title="By Channel" data={data.channelBreakdown} height={180} centerLabel="Channel" centerValue={String(data.channelBreakdown.length)} queryTimeMs={data.queryTimeMs} />
            )}
            {data.orderStatusBreakdown.length > 0 && (
              <DonutChart title="Order Status" data={data.orderStatusBreakdown} height={180} centerLabel="Status" centerValue={String(data.orderStatusBreakdown.length)} queryTimeMs={data.queryTimeMs} />
            )}
          </div>

          {/* Hourly Revenue + Payment Health */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {data.hourlyRevenue.length > 0 && (
              <TimeSeriesChart
                title="Hourly Sales Activity"
                subtitle="Revenue and orders by hour today"
                data={data.hourlyRevenue}
                xKey="hour"
                lines={[
                  { key: "revenue", color: "#34d399", label: "Revenue (€)" },
                  { key: "orders", color: "#60a5fa", label: "Orders" },
                ]}
                type="bar"
                queryTimeMs={data.queryTimeMs}
              />
            )}
            <TimeSeriesChart
              title="Payment Health"
              subtitle="Success vs failure rate over time"
              data={data.payments}
              xKey="date"
              lines={[
                { key: "success", color: "#34d399", label: "Success" },
                { key: "failed", color: "#f87171", label: "Failed" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
          </div>

          {/* Tables: Leaderboards */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankedTable
              title="Top Accounts"
              data={data.customers}
              columns={[
                { key: "name", label: "Account" },
                { key: "country", label: "Region" },
                { key: "tier", label: "Tier" },
                { key: "totalSpent", label: "Revenue", format: "currency", align: "right" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
            <RankedTable
              title="Top Products"
              data={data.products}
              columns={[
                { key: "name", label: "Product" },
                { key: "revenue", label: "Revenue", format: "currency", align: "right" },
                { key: "units", label: "Units", format: "number", align: "right" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RankedTable
              title="Revenue by Region"
              data={data.regions}
              columns={[
                { key: "region", label: "Country" },
                { key: "revenue", label: "Revenue", format: "currency", align: "right" },
                { key: "orders", label: "Deals", format: "number", align: "right" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
            <RankedTable
              title="Payment Failure Analysis"
              data={data.failures}
              columns={[
                { key: "reason", label: "Failure Reason" },
                { key: "count", label: "Count", format: "number", align: "right" },
                { key: "impact", label: "Lost Revenue", format: "currency", align: "right" },
              ]}
              queryTimeMs={data.queryTimeMs}
            />
          </div>
        </>
      )}

      {/* ─── Transaction Manager Tab ─── */}
      {tab === "transactions" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[--muted]" />
              <input
                type="text"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchTransactions()}
                placeholder="Search by Order ID, customer name, or email..."
                className="w-full rounded-lg border border-[--border] bg-[--surface] pl-9 pr-3 py-2 text-sm text-[--fg] placeholder:text-[--muted] focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <select
              value={txStatus}
              onChange={(e) => { setTxStatus(e.target.value); searchTransactions(txSearch, e.target.value); }}
              className="rounded-lg border border-[--border] bg-[--surface] px-3 py-2 text-sm text-[--fg] focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="shipped">Shipped</option>
              <option value="cancelled">Cancelled</option>
              <option value="refunded">Refunded</option>
            </select>
            <button
              onClick={() => searchTransactions()}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
            >
              Search
            </button>
          </div>

          {txMsg && (
            <div className={`rounded-lg px-3 py-2 text-xs font-medium ${txMsg.startsWith("Error") ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
              {txMsg}
            </div>
          )}

          {txLoading ? (
            <div className="flex items-center gap-2 py-16 justify-center text-[--muted]">
              <Loader2 className="h-5 w-5 animate-spin" /> Searching...
            </div>
          ) : txRows.length > 0 ? (
            <div className="rounded-xl border border-[--border] bg-[--surface]">
              <div className="px-5 py-3 border-b border-[--border]">
                <p className="text-xs text-[--muted]">{txTotal.toLocaleString()} transactions found</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[--border] text-left text-xs text-[--muted]">
                      <th className="px-3 py-2.5">ID</th>
                      <th className="px-3 py-2.5">Customer</th>
                      <th className="px-3 py-2.5">Email</th>
                      <th className="px-3 py-2.5">Tier</th>
                      <th className="px-3 py-2.5 text-right">Amount</th>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Payment</th>
                      <th className="px-3 py-2.5">Country</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txRows.map((tx) => (
                      <tr key={tx.id} className="border-b border-[--border-subtle] hover:bg-[--surface-hover] transition-colors">
                        {txEditId === tx.id ? (
                          <>
                            <td className="px-3 py-2 text-[--muted-fg] font-mono text-xs">#{tx.id}</td>
                            <td className="px-3 py-2">
                              <input value={txEditData.customer_name ?? ""} onChange={(e) => setTxEditData({ ...txEditData, customer_name: e.target.value })} className="w-full rounded border border-[--border] bg-[--surface] px-2 py-1 text-xs text-[--fg]" />
                            </td>
                            <td className="px-3 py-2">
                              <input value={txEditData.customer_email ?? ""} onChange={(e) => setTxEditData({ ...txEditData, customer_email: e.target.value })} className="w-full rounded border border-[--border] bg-[--surface] px-2 py-1 text-xs text-[--fg]" />
                            </td>
                            <td className="px-3 py-2">
                              <select value={txEditData.customer_tier ?? ""} onChange={(e) => setTxEditData({ ...txEditData, customer_tier: e.target.value })} className="rounded border border-[--border] bg-[--surface] px-2 py-1 text-xs text-[--fg]">
                                {["Standard", "Growth", "Gold", "Platinum", "Enterprise", "VIP"].map((t) => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input type="number" step="0.01" value={txEditData.total_amount ?? ""} onChange={(e) => setTxEditData({ ...txEditData, total_amount: parseFloat(e.target.value) })} className="w-24 rounded border border-[--border] bg-[--surface] px-2 py-1 text-xs text-[--fg] text-right" />
                            </td>
                            <td className="px-3 py-2">
                              <select value={txEditData.status ?? ""} onChange={(e) => setTxEditData({ ...txEditData, status: e.target.value })} className="rounded border border-[--border] bg-[--surface] px-2 py-1 text-xs text-[--fg]">
                                {["completed", "pending", "shipped", "cancelled", "refunded"].map((s) => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <select value={txEditData.payment_method ?? ""} onChange={(e) => setTxEditData({ ...txEditData, payment_method: e.target.value })} className="rounded border border-[--border] bg-[--surface] px-2 py-1 text-xs text-[--fg]">
                                {["credit_card", "debit_card", "paypal", "apple_pay", "wire_transfer", "crypto"].map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input value={txEditData.country ?? ""} onChange={(e) => setTxEditData({ ...txEditData, country: e.target.value })} className="w-16 rounded border border-[--border] bg-[--surface] px-2 py-1 text-xs text-[--fg]" />
                            </td>
                            <td className="px-3 py-2 text-xs text-[--muted]">{new Date(tx.created_at).toLocaleDateString()}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <button onClick={saveEdit} disabled={txSaving} className="rounded bg-emerald-500/20 p-1.5 text-emerald-400 hover:bg-emerald-500/30 transition-colors" title="Save">
                                  {txSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                </button>
                                <button onClick={() => setTxEditId(null)} className="rounded bg-red-500/20 p-1.5 text-red-400 hover:bg-red-500/30 transition-colors" title="Cancel">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-[--muted-fg] font-mono text-xs">#{tx.id}</td>
                            <td className="px-3 py-2 text-[--fg] font-medium">{tx.customer_name ?? "—"}</td>
                            <td className="px-3 py-2 text-[--muted-fg] text-xs">{tx.customer_email ?? "—"}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                tx.customer_tier === "VIP" ? "bg-violet-500/20 text-violet-400" :
                                tx.customer_tier === "Enterprise" ? "bg-blue-500/20 text-blue-400" :
                                tx.customer_tier === "Platinum" ? "bg-cyan-500/20 text-cyan-400" :
                                tx.customer_tier === "Gold" ? "bg-amber-500/20 text-amber-400" :
                                tx.customer_tier === "Growth" ? "bg-emerald-500/20 text-emerald-400" :
                                "bg-[--surface-hover] text-[--muted-fg]"
                              }`}>
                                {tx.customer_tier ?? "—"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-[--fg] font-medium">€{Number(tx.total_amount).toFixed(2)}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                tx.status === "completed" ? "bg-emerald-500/20 text-emerald-400" :
                                tx.status === "shipped" ? "bg-blue-500/20 text-blue-400" :
                                tx.status === "pending" ? "bg-amber-500/20 text-amber-400" :
                                tx.status === "cancelled" ? "bg-red-500/20 text-red-400" :
                                tx.status === "refunded" ? "bg-violet-500/20 text-violet-400" :
                                "bg-[--surface-hover] text-[--muted-fg]"
                              }`}>
                                {tx.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[--muted-fg] text-xs">{tx.payment_method}</td>
                            <td className="px-3 py-2 text-[--muted-fg]">{tx.country}</td>
                            <td className="px-3 py-2 text-xs text-[--muted]">{new Date(tx.created_at).toLocaleDateString()}</td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => startEdit(tx)} className="rounded bg-emerald-500/10 p-1.5 text-emerald-500 hover:bg-emerald-500/20 transition-colors" title="Edit transaction">
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[--border] bg-[--surface] py-16 text-center">
              <ClipboardList className="mx-auto h-10 w-10 text-[--muted] mb-3" />
              <p className="text-sm text-[--muted-fg]">Search for transactions by order ID, customer name, or email</p>
              <p className="text-xs text-[--muted] mt-1">Use the search bar above or filter by status</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Contract Import Tab ─── */}
      {tab === "contracts" && (
        <div className="space-y-5">
          {/* Upload zone */}
          {!contractData && !contractExtracting && (
            <div className="rounded-xl border-2 border-dashed border-[--border] bg-[--surface] p-10 text-center transition-colors hover:border-emerald-500/50">
              <FileUp className="mx-auto h-10 w-10 text-[--muted] mb-3" />
              <p className="text-sm font-medium text-[--fg] mb-1">Upload a sales contract</p>
              <p className="text-xs text-[--muted] mb-4">PDF, PNG, or JPG — the AI agent will extract all data</p>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors">
                <FileUp className="h-4 w-4" />
                Choose file
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) { setContractFile(f); setContractMsg(null); }
                  }}
                />
              </label>
              {contractFile && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-1.5">
                    <FileText className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{contractFile.name}</span>
                    <span className="text-[10px] text-[--muted]">({(contractFile.size / 1024).toFixed(0)} KB)</span>
                  </div>
                  <button
                    onClick={handleContractUpload}
                    className="rounded-lg bg-emerald-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
                  >
                    Extract Data
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Extracting spinner */}
          {contractExtracting && (
            <div className="rounded-xl border border-[--border] bg-[--surface] py-16 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-500 mb-3" />
              <p className="text-sm font-medium text-[--fg]">AI Agent is reading the contract...</p>
              <p className="text-xs text-[--muted] mt-1">Extracting customer, order, items, and payment data</p>
            </div>
          )}

          {/* Message */}
          {contractMsg && (
            <div className={`rounded-lg px-4 py-2.5 text-xs font-medium flex items-center gap-2 ${
              contractMsg.type === "error" ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
            }`}>
              {contractMsg.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {contractMsg.text}
            </div>
          )}

          {/* Extracted data preview */}
          {contractData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-[--fg] flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  Extracted Contract Data
                </h3>
                <div className="flex items-center gap-2">
                  {!contractInserted && (
                    <button
                      onClick={handleContractInsert}
                      disabled={contractInserting}
                      className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
                    >
                      {contractInserting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
                      {contractInserting ? "Inserting..." : "Insert into PostgreSQL"}
                    </button>
                  )}
                  <button
                    onClick={resetContract}
                    className="flex items-center gap-2 rounded-lg border border-[--border] px-3 py-2 text-xs text-[--muted] hover:text-[--fg] transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    New import
                  </button>
                </div>
              </div>

              {contractData.summary && (
                <p className="rounded-lg bg-emerald-500/5 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-400 italic border border-emerald-500/10">
                  {contractData.summary}
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer card */}
                <div className="rounded-xl border border-[--border] bg-[--surface] p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Customer
                  </h4>
                  <div className="space-y-2">
                    {([
                      ["Name", contractData.customer.full_name],
                      ["Email", contractData.customer.email || "—"],
                      ["Country", contractData.customer.country],
                      ["Tier", contractData.customer.tier],
                      ["VIP", contractData.customer.is_vip ? "Yes" : "No"],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-[--muted]">{k}</span>
                        <span className="text-[--fg] font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Order card */}
                <div className="rounded-xl border border-[--border] bg-[--surface] p-4 space-y-3">
                  <h4 className="text-xs font-semibold text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
                    <ShoppingCart className="h-3.5 w-3.5" /> Order
                  </h4>
                  <div className="space-y-2">
                    {([
                      ["Total Amount", `€${Number(contractData.order.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`],
                      ["Status", contractData.order.status],
                      ["Payment Method", contractData.order.payment_method],
                      ["Country", contractData.order.country],
                      ["Channel", contractData.order.channel],
                    ] as [string, string][]).map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs">
                        <span className="text-[--muted]">{k}</span>
                        <span className="text-[--fg] font-medium">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Items table */}
              {contractData.items.length > 0 && (
                <div className="rounded-xl border border-[--border] bg-[--surface] overflow-hidden">
                  <div className="px-4 py-3 border-b border-[--border]">
                    <h4 className="text-xs font-semibold text-emerald-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" /> Items ({contractData.items.length})
                    </h4>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[--border] text-left text-[10px] text-[--muted] uppercase tracking-wider">
                        <th className="px-4 py-2">Product</th>
                        <th className="px-4 py-2">Category</th>
                        <th className="px-4 py-2 text-center">Qty</th>
                        <th className="px-4 py-2 text-right">Unit Price</th>
                        <th className="px-4 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contractData.items.map((item, i) => (
                        <tr key={i} className="border-b border-[--border-subtle] last:border-0">
                          <td className="px-4 py-2.5 text-xs text-[--fg] font-medium">{item.product_name}</td>
                          <td className="px-4 py-2.5 text-xs text-[--muted]">{item.category}</td>
                          <td className="px-4 py-2.5 text-xs text-[--fg] text-center">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-xs text-[--fg] text-right tabular-nums">€{Number(item.unit_price).toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-xs text-[--fg] text-right tabular-nums font-medium">€{Number(item.total_price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payment card */}
              <div className="rounded-xl border border-[--border] bg-[--surface] p-4">
                <h4 className="text-xs font-semibold text-emerald-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                  <CreditCard className="h-3.5 w-3.5" /> Payment
                </h4>
                <div className="flex gap-6 text-xs">
                  <div>
                    <span className="text-[--muted]">Status: </span>
                    <span className={`font-medium ${contractData.payment.status === "paid" ? "text-emerald-500" : "text-amber-500"}`}>
                      {contractData.payment.status}
                    </span>
                  </div>
                  {contractData.payment.provider && (
                    <div>
                      <span className="text-[--muted]">Provider: </span>
                      <span className="text-[--fg] font-medium">{contractData.payment.provider}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!contractData && !contractExtracting && !contractFile && (
            <div className="rounded-xl border border-[--border] bg-[--surface] p-8">
              <h3 className="text-sm font-semibold text-[--fg] mb-3">How it works</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { step: "1", title: "Upload", desc: "Upload a PDF or image of a sales contract" },
                  { step: "2", title: "Review", desc: "AI extracts customer, order, items & payment data" },
                  { step: "3", title: "Insert", desc: "Validate and insert directly into PostgreSQL" },
                ].map((s) => (
                  <div key={s.step} className="flex gap-3">
                    <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-xs font-bold text-emerald-500">{s.step}</div>
                    <div>
                      <p className="text-xs font-semibold text-[--fg]">{s.title}</p>
                      <p className="text-[10px] text-[--muted] mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <CopilotPanel persona="sales" />

      {data.queryTimeMs > 0 && (
        <p className="text-right text-[10px] tabular-nums text-[--muted]" style={{ opacity: 0.5 }}>
          Query: {data.queryTimeMs}ms
        </p>
      )}
    </div>
  );
}
