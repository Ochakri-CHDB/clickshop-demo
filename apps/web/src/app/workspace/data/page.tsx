"use client";

import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import {
  Play,
  Database,
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Table2,
  ChevronDown,
  X,
  FileSpreadsheet,
  Clock,
  Rows3,
  Terminal,
  Save,
  FolderOpen,
  Sparkles,
  MessageSquare,
  Activity,
  Zap,
  Search,
  Layers,
  Coins,
  ShieldCheck,
} from "lucide-react";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { AgentGrid, type AgentDef } from "@/components/dashboard/AgentCard";

const DATA_AGENTS: AgentDef[] = [
  { id: "data-anomaly-detector", label: "Anomaly Detector", description: "Scans for unusual spikes or drops in orders, payments, traffic, and funnel conversion rates.", icon: Activity, persona: "data-anomaly-detector", accentFrom: "#ef4444", accentTo: "#f97316", iconBg: "rgba(239,68,68,0.15)", glowColor: "rgba(239,68,68,0.1)" },
  { id: "data-pipeline-health", label: "Pipeline Health", description: "Monitors ClickHouse ingestion rate, CDC replication lag, data freshness, and query latency.", icon: Zap, persona: "data-pipeline-health", accentFrom: "#22c55e", accentTo: "#10b981", iconBg: "rgba(34,197,94,0.15)", glowColor: "rgba(34,197,94,0.1)" },
  { id: "data-query-optimizer", label: "Query Optimizer", description: "Suggests missing indexes, materialized views, partition keys, and JOIN optimizations.", icon: Search, persona: "data-query-optimizer", accentFrom: "#3b82f6", accentTo: "#60a5fa", iconBg: "rgba(59,130,246,0.15)", glowColor: "rgba(59,130,246,0.1)" },
  { id: "data-schema-advisor", label: "Schema Advisor", description: "Recommends denormalization, codec optimization, TTL policies, and engine selection.", icon: Layers, persona: "data-schema-advisor", accentFrom: "#8b5cf6", accentTo: "#a78bfa", iconBg: "rgba(139,92,246,0.15)", glowColor: "rgba(139,92,246,0.1)" },
  { id: "data-cost-analyzer", label: "Cost Analyzer", description: "Identifies storage waste, query cost hotspots, and hot/warm/cold data tier opportunities.", icon: Coins, persona: "data-cost-analyzer", accentFrom: "#f59e0b", accentTo: "#fbbf24", iconBg: "rgba(245,158,11,0.15)", glowColor: "rgba(245,158,11,0.1)" },
  { id: "data-data-quality", label: "Data Quality", description: "Checks NULL rates, duplicates, referential integrity, freshness, and schema consistency.", icon: ShieldCheck, persona: "data-data-quality", accentFrom: "#ec4899", accentTo: "#f472b6", iconBg: "rgba(236,72,153,0.15)", glowColor: "rgba(236,72,153,0.1)" },
];

const NotebookPanel = lazy(() =>
  import("@/components/notebook/NotebookPanel").then((m) => ({ default: m.NotebookPanel }))
);

type Tab = "clickhouse" | "postgres" | "notebook" | "agents";

type DB = "clickhouse" | "postgres";

interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
  error?: string;
}

interface TableInfo {
  name: string;
  engine?: string;
  rows?: string;
  mirrored?: boolean;
  layer?: "gold" | "silver" | "bronze";
}

const EXAMPLE_QUERIES: Record<DB, string[]> = {
  clickhouse: [
    "SELECT\n  toDate(event_time) AS day,\n  country,\n  count() AS orders,\n  round(sum(total_amount), 2) AS revenue,\n  round(avg(total_amount), 2) AS avg_order_value,\n  uniq(customer_id) AS unique_customers\nFROM order_events\nWHERE event_time >= now() - INTERVAL 7 DAY\nGROUP BY day, country\nORDER BY day DESC, revenue DESC\nLIMIT 50",
    "SELECT\n  category,\n  count() AS orders,\n  round(sum(total_amount), 2) AS revenue,\n  round(revenue / (SELECT sum(total_amount) FROM order_events) * 100, 1) AS pct_share,\n  round(avg(total_amount), 2) AS avg_basket\nFROM order_events\nGROUP BY category\nORDER BY revenue DESC",
    "SELECT\n  toHour(event_time) AS hour,\n  countIf(event_type = 'page_view') AS views,\n  countIf(event_type = 'purchase') AS purchases,\n  round(purchases / greatest(views, 1) * 100, 2) AS conversion_pct\nFROM checkout_events\nWHERE event_time >= today() - 7\nGROUP BY hour\nORDER BY hour",
    "SELECT\n  channel,\n  country,\n  count() AS orders,\n  round(sum(total_amount), 2) AS revenue,\n  round(avg(quantity), 1) AS avg_items\nFROM order_events\nGROUP BY channel, country\nHAVING orders > 10\nORDER BY revenue DESC\nLIMIT 30",
  ],
  postgres: [
    "SELECT\n  c.tier,\n  count(DISTINCT c.id) AS customers,\n  count(o.id) AS total_orders,\n  round(avg(o.total_amount)::numeric, 2) AS avg_order\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nGROUP BY c.tier\nORDER BY avg_order DESC",
    "SELECT status, count(*) AS cnt FROM orders GROUP BY status ORDER BY cnt DESC",
    "SELECT p.name, sum(oi.quantity) AS sold,\n  round(sum(oi.quantity * oi.unit_price)::numeric, 2) AS revenue\nFROM order_items oi\nJOIN products p ON p.id = oi.product_id\nGROUP BY p.name\nORDER BY revenue DESC\nLIMIT 10",
  ],
};

function formatRowCount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function DataWorkspacePage() {
  const [tab, setTab] = useState<Tab>("clickhouse");
  const db: DB = tab === "postgres" ? "postgres" : "clickhouse";
  const [query, setQuery] = useState(EXAMPLE_QUERIES.clickhouse[0]);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTarget, setUploadTarget] = useState("csv_import");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [showSavedSql, setShowSavedSql] = useState(false);
  const [savedSqlList, setSavedSqlList] = useState<string[]>([]);
  const [sqlSaveMsg, setSqlSaveMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nlPrompt, setNlPrompt] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const SQL_KEY = "clickshop_sql_queries";

  const refreshSqlList = useCallback(() => {
    try {
      const raw = localStorage.getItem(SQL_KEY);
      if (raw) setSavedSqlList(Object.keys(JSON.parse(raw)));
      else setSavedSqlList([]);
    } catch { setSavedSqlList([]); }
  }, []);

  const saveSqlQuery = () => {
    const name = prompt("Query name:");
    if (!name?.trim()) return;
    try {
      const existing = JSON.parse(localStorage.getItem(SQL_KEY) || "{}");
      existing[name.trim()] = { savedAt: new Date().toISOString(), query, database: db };
      localStorage.setItem(SQL_KEY, JSON.stringify(existing));
      setSqlSaveMsg(`Saved "${name.trim()}"`);
      setTimeout(() => setSqlSaveMsg(null), 2000);
      refreshSqlList();
    } catch { /* ignore */ }
  };

  const loadSqlQuery = (name: string) => {
    try {
      const existing = JSON.parse(localStorage.getItem(SQL_KEY) || "{}");
      const saved = existing[name];
      if (saved) {
        setQuery(saved.query);
        setShowSavedSql(false);
      }
    } catch { /* ignore */ }
  };

  const deleteSqlQuery = (name: string) => {
    try {
      const existing = JSON.parse(localStorage.getItem(SQL_KEY) || "{}");
      delete existing[name];
      localStorage.setItem(SQL_KEY, JSON.stringify(existing));
      refreshSqlList();
    } catch { /* ignore */ }
  };

  const fetchTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await fetch(`/api/sql/tables?database=${db}`);
      const data = await res.json();
      if (Array.isArray(data)) setTables(data);
    } catch { /* ignore */ }
    setTablesLoading(false);
  }, [db]);

  useEffect(() => {
    if (tab !== "notebook") fetchTables();
  }, [fetchTables, tab]);

  useEffect(() => {
    if (tab !== "notebook") {
      setQuery(EXAMPLE_QUERIES[db][0]);
      setResult(null);
    }
  }, [tab, db]);

  const runQuery = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/sql/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, database: db }),
      });
      const data = await res.json();
      if (data.error) {
        setResult({ columns: [], rows: [], rowCount: 0, durationMs: 0, error: data.error });
      } else {
        setResult(data);
      }
    } catch (err) {
      setResult({
        columns: [],
        rows: [],
        rowCount: 0,
        durationMs: 0,
        error: err instanceof Error ? err.message : "Network error",
      });
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
  };

  const generateSQL = async () => {
    if (!nlPrompt.trim()) return;
    setNlLoading(true);
    try {
      const res = await fetch("/api/sql/text2sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nlPrompt, database: db }),
      });
      const data = await res.json();
      if (data.sql) {
        setQuery(data.sql);
        setNlPrompt("");
      }
    } catch { /* ignore */ }
    setNlLoading(false);
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !uploadTarget) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("table", uploadTarget);
      formData.append("database", db);
      const res = await fetch("/api/sql/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) {
        setUploadResult(`Error: ${data.error}`);
      } else {
        setUploadResult(`Inserted ${data.inserted} rows into ${data.table} (${data.durationMs}ms)`);
        fetchTables();
      }
    } catch (err) {
      setUploadResult(`Error: ${err instanceof Error ? err.message : "Upload failed"}`);
    }
    setUploading(false);
  };

  const insertTableName = (name: string, mirrored?: boolean) => {
    let ref = name;
    if ((mirrored || name.startsWith("public_")) && db === "clickhouse") ref += " FINAL";
    setQuery((prev) => {
      const trimmed = prev.trimEnd();
      return trimmed ? trimmed + " " + ref : ref;
    });
  };

  const [inspectedTable, setInspectedTable] = useState<string | null>(null);
  const [inspectedDdl, setInspectedDdl] = useState<string | null>(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  const [inspectedEngine, setInspectedEngine] = useState<string | undefined>();
  const [inspectedRows, setInspectedRows] = useState<string | undefined>();

  const inspectTable = async (t: TableInfo) => {
    if (inspectedTable === t.name) {
      setInspectedTable(null);
      return;
    }
    setInspectedTable(t.name);
    setInspectedEngine(t.engine);
    setInspectedRows(t.rows);
    setInspectedDdl(null);
    setInspectLoading(true);
    try {
      const res = await fetch(
        `/api/sql/tables?database=${db}&ddl=${encodeURIComponent(t.name)}`,
      );
      const data = await res.json();
      if (data.error) {
        setInspectedDdl(`-- Error: ${data.error}`);
      } else if (typeof data.ddl === "string") {
        setInspectedDdl(data.ddl);
      } else {
        setInspectedDdl(`-- No DDL found for ${t.name}`);
      }
    } catch {
      setInspectedDdl(`-- Failed to fetch DDL`);
    }
    setInspectLoading(false);
  };

  /* Agents tab */
  if (tab === "agents") {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        <div className="flex items-center gap-1 border-b border-[--border] px-4">
          {renderTabs(tab, setTab)}
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-[--fg]">AI Agents</h2>
            <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[--muted]">Powered by LibreChat</span>
          </div>
          <AgentGrid agents={DATA_AGENTS} />
        </div>
      </div>
    );
  }

  /* Notebook tab */
  if (tab === "notebook") {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] flex-col">
        <div className="flex items-center gap-1 border-b border-[--border] px-4">
          {renderTabs(tab, setTab)}
        </div>
        <div className="flex-1 overflow-hidden">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-[--brand]" />
                <span className="ml-2 text-sm text-[--muted]">Loading notebook...</span>
              </div>
            }
          >
            <NotebookPanel />
          </Suspense>
        </div>
      </div>
    );
  }

  /* SQL Editor tab */
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center gap-1 border-b border-[--border] px-4">
        {renderTabs(tab, setTab)}
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        {/* Left sidebar: import + tables */}
        <div className="flex w-64 shrink-0 flex-col gap-3 overflow-hidden">
          {/* Import Files */}
          <div className="rounded-xl border border-[--border] bg-[--surface] p-3">
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="flex w-full items-center gap-1.5 text-xs font-medium text-[--muted-fg]"
            >
              <Upload className="h-3.5 w-3.5" />
              Import Files
              <ChevronDown
                className={`ml-auto h-3 w-3 transition-transform ${showUpload ? "rotate-180" : ""}`}
              />
            </button>
            {showUpload && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center rounded-md border border-[--border] bg-[--surface-solid] text-xs">
                  <span className="pl-2 text-[--muted]">uploads_</span>
                  <input
                    value={uploadTarget}
                    onChange={(e) => setUploadTarget(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 55))}
                    placeholder="my_table"
                    className="w-full bg-transparent px-1 py-1.5 text-[--muted-fg] outline-none"
                  />
                </div>
                <p className="text-[10px] text-[--muted]">CSV, max 5 MB / 50k rows. Creates or appends to a dedicated uploads_ table.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="w-full text-xs text-[--muted] file:mr-2 file:rounded-md file:border-0 file:bg-[--surface-hover] file:px-2 file:py-1 file:text-xs file:text-[--muted-fg]"
                />
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-brand-400 px-3 py-1.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-brand-300 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3 w-3" />
                  )}
                  {uploading ? "Importing..." : "Import File"}
                </button>
                {uploadResult && (
                  <p
                    className={`text-xs ${
                      uploadResult.startsWith("Error") ? "text-red-400" : "text-emerald-400"
                    }`}
                  >
                    {uploadResult}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Tables list */}
          <div className="flex-1 overflow-hidden rounded-xl border border-[--border] bg-[--surface]">
            <div className="flex items-center gap-1.5 border-b border-[--border] px-3 py-2">
              <Database className="h-3.5 w-3.5 text-[--muted]" />
              <span className="text-xs font-medium text-[--muted-fg]">
                {db === "clickhouse" ? "ClickHouse" : "PostgreSQL"} tables
              </span>
              {tablesLoading && <Loader2 className="ml-auto h-3 w-3 animate-spin text-[--muted]" />}
            </div>
            <div className="flex-1 overflow-y-auto p-1" style={{ maxHeight: "calc(100vh - 16rem)" }}>
              {tables.map((t, i) => {
                const prevLayer = i > 0 ? tables[i - 1].layer : undefined;
                const layerColor = t.layer === "gold" ? "text-amber-400" : t.layer === "silver" ? "text-slate-300" : t.layer === "bronze" ? "text-orange-400" : "text-[--muted]";
                const layerBadge = t.layer === "gold" ? { bg: "bg-amber-500/15", text: "text-amber-400", label: "GOLD" }
                  : t.layer === "silver" ? { bg: "bg-slate-400/15", text: "text-slate-300", label: "SILVER" }
                  : t.layer === "bronze" ? { bg: "bg-orange-500/15", text: "text-orange-400", label: "RAW" }
                  : null;
                return (
                  <div key={t.name}>
                    {t.layer && t.layer !== prevLayer && (
                      <div className="mt-2 mb-1 px-2.5 text-[9px] font-bold uppercase tracking-wider text-[--muted] first:mt-0">
                        {t.layer === "gold" ? "Gold Layer" : t.layer === "silver" ? "Silver Layer" : "Bronze / Raw"}
                      </div>
                    )}
                    <button
                      onClick={() => inspectTable(t)}
                      onDoubleClick={() => insertTableName(t.name, t.mirrored)}
                      draggable
                      onDragStart={(e) => {
                        let ref = t.name;
                        if ((t.mirrored || t.name.startsWith("public_")) && db === "clickhouse") ref += " FINAL";
                        e.dataTransfer.setData("text/plain", ref);
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      className={`flex w-full cursor-grab items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-[--surface-hover] hover:text-[--fg] active:cursor-grabbing ${inspectedTable === t.name ? "bg-[--surface-hover] text-[--fg]" : "text-[--muted-fg]"}`}
                      title={`Click to inspect, double-click to insert, drag to SQL editor`}
                    >
                      <Table2 className={`h-3 w-3 shrink-0 ${layerColor}`} />
                      <span className="flex-1 truncate">{t.name}</span>
                      {layerBadge && (
                        <span className={`rounded ${layerBadge.bg} px-1 py-0.5 text-[9px] font-medium ${layerBadge.text}`}>{layerBadge.label}</span>
                      )}
                      {t.rows && (
                        <span className="text-[10px] text-[--muted]">{formatRowCount(Number(t.rows))}</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main area: editor + results */}
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          {/* Text to SQL */}
          <div className="flex items-center gap-2 rounded-xl border border-[--border] bg-[--surface] px-3 py-2">
            <Sparkles className="h-4 w-4 shrink-0 text-[--brand]" />
            <input
              type="text"
              value={nlPrompt}
              onChange={(e) => setNlPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); generateSQL(); } }}
              placeholder={db === "clickhouse" ? "Ask in natural language... e.g. \"Revenue by country last 7 days\"" : "Ask in natural language... e.g. \"Top 10 customers by total orders\""}
              className="flex-1 bg-transparent text-sm text-[--fg] placeholder:text-[--muted] focus:outline-none"
            />
            <button
              onClick={generateSQL}
              disabled={nlLoading || !nlPrompt.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-400 px-3 py-1.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-brand-300 disabled:opacity-50"
            >
              {nlLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageSquare className="h-3.5 w-3.5" />}
              Generate SQL
            </button>
          </div>

          {/* SQL Editor */}
          <div className="rounded-xl border border-[--border] bg-[--surface]">
            <div className="flex items-center justify-between border-b border-[--border] px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[--muted-fg]">SQL Editor</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    db === "clickhouse"
                      ? "bg-[--brand-badge-bg] text-[--brand]"
                      : "bg-blue-400/10 text-blue-400"
                  }`}
                >
                  {db === "clickhouse" ? "ClickHouse" : "PostgreSQL"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {sqlSaveMsg && (
                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> {sqlSaveMsg}
                  </span>
                )}
                <button
                  onClick={saveSqlQuery}
                  disabled={!query.trim()}
                  className="flex items-center gap-1 rounded-lg border border-[--border] px-2.5 py-1.5 text-xs text-[--muted-fg] transition-colors hover:bg-[--surface-hover] hover:text-[--fg] disabled:opacity-50"
                  title="Save query"
                >
                  <Save className="h-3 w-3" />
                  Save
                </button>
                <div className="relative">
                  <button
                    onClick={() => { setShowSavedSql(!showSavedSql); refreshSqlList(); }}
                    className="flex items-center gap-1 rounded-lg border border-[--border] px-2.5 py-1.5 text-xs text-[--muted-fg] transition-colors hover:bg-[--surface-hover] hover:text-[--fg]"
                    title="Load saved query"
                  >
                    <FolderOpen className="h-3 w-3" />
                    Load
                  </button>
                  {showSavedSql && (
                    <div className="absolute right-0 top-full z-10 mt-1 w-64 rounded-lg border border-[--border] bg-[--surface-solid] p-2 shadow-xl">
                      <p className="mb-1 px-2 text-[10px] font-medium text-[--muted]">Saved queries</p>
                      {savedSqlList.length === 0 && (
                        <p className="px-2 py-3 text-center text-xs text-[--muted]">No saved queries</p>
                      )}
                      {savedSqlList.map((name) => (
                        <div key={name} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-[--muted-fg] hover:bg-[--surface-hover] hover:text-[--fg]">
                          <button onClick={() => loadSqlQuery(name)} className="flex-1 truncate text-left">
                            {name}
                          </button>
                          <button onClick={() => deleteSqlQuery(name)} className="shrink-0 text-[--muted] hover:text-red-400" title="Delete">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mx-0.5 h-4 w-px bg-[--border]" />
                <div className="relative">
                  <button
                    onClick={() => setShowExamples(!showExamples)}
                    className="text-xs text-[--muted] hover:text-[--fg]"
                  >
                    Examples ▾
                  </button>
                  {showExamples && (
                    <div className="absolute right-0 top-full z-10 mt-1 w-80 rounded-lg border border-[--border] bg-[--surface-solid] p-2 shadow-xl">
                      {EXAMPLE_QUERIES[db].map((eq, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            setQuery(eq);
                            setShowExamples(false);
                          }}
                          className="block w-full rounded px-2 py-1.5 text-left text-xs text-[--muted-fg] hover:bg-[--surface-hover] hover:text-[--fg]"
                        >
                          <code className="line-clamp-2">{eq}</code>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={runQuery}
                  disabled={loading || !query.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-brand-400 px-3 py-1.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-brand-300 disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Run
                  <kbd className="ml-1 rounded bg-zinc-950/20 px-1 py-0.5 text-[10px]">⌘↵</kbd>
                </button>
              </div>
            </div>
            <CodeEditor
              value={query}
              onChange={setQuery}
              language="sql"
              placeholder="Write your SQL query here..."
              minHeight="120px"
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Results */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[--border] bg-[--surface]">
            <div className="flex items-center gap-3 border-b border-[--border] px-4 py-2">
              <span className="text-xs font-medium text-[--muted-fg]">Results</span>
              {result && !result.error && (
                <>
                  <span className="flex items-center gap-1 text-[10px] text-[--muted]">
                    <Rows3 className="h-3 w-3" />
                    {result.rowCount.toLocaleString()} rows
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-[--muted]">
                    <Clock className="h-3 w-3" />
                    {result.durationMs}ms
                  </span>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                </>
              )}
              {result?.error && (
                <span className="flex items-center gap-1 text-xs text-red-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Error
                </span>
              )}
              {result && (
                <button
                  onClick={() => setResult(null)}
                  className="ml-auto text-[--muted] hover:text-[--fg]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto">
              {loading && (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-[--brand]" />
                </div>
              )}

              {!loading && !result && (
                <div className="flex flex-col items-center justify-center py-16 text-[--muted]">
                  <Play className="mb-2 h-8 w-8" />
                  <p className="text-sm">Run a query to see results</p>
                  <p className="mt-1 text-xs">⌘+Enter to execute</p>
                </div>
              )}

              {result?.error && (
                <div className="p-4">
                  <pre className="whitespace-pre-wrap rounded-lg bg-red-500/5 p-4 font-mono text-xs text-red-400">
                    {result.error}
                  </pre>
                </div>
              )}

              {result && !result.error && result.columns.length > 0 && (
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[--surface-solid] backdrop-blur">
                    <tr>
                      <th className="w-10 px-3 py-2 text-[--muted]">#</th>
                      {result.columns.map((col) => (
                        <th key={col} className="max-w-[200px] truncate px-3 py-2 font-medium text-[--muted-fg]">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, ri) => (
                      <tr key={ri} className="border-t border-[--border-subtle] transition-colors hover:bg-[--surface-hover]">
                        <td className="px-3 py-1.5 text-[--muted]">{ri + 1}</td>
                        {result.columns.map((col) => (
                          <td
                            key={col}
                            className="max-w-[200px] truncate px-3 py-1.5 text-[--fg]"
                            title={String(row[col] ?? "")}
                          >
                            {row[col] === null ? (
                              <span className="text-[--muted]">NULL</span>
                            ) : (
                              String(row[col])
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {result && !result.error && result.columns.length === 0 && result.rowCount > 0 && (
                <div className="flex items-center justify-center py-16">
                  <p className="text-sm text-emerald-400">
                    <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
                    Query executed successfully. {result.rowCount} rows affected ({result.durationMs}ms)
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Table Inspector panel */}
        {inspectedTable && (
          <div className="flex w-[22rem] shrink-0 flex-col overflow-hidden rounded-xl border border-[--border] bg-[--surface]">
            <div className="flex items-center justify-between border-b border-[--border] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Table2 className="h-3.5 w-3.5 text-[--brand]" />
                <span className="text-sm font-semibold text-[--fg]">Table inspector</span>
              </div>
              <button
                onClick={() => setInspectedTable(null)}
                className="rounded-md p-1 text-[--muted] transition-colors hover:bg-[--surface-hover] hover:text-[--fg]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="border-b border-[--border] px-4 py-3">
              <p className="text-sm font-medium text-[--fg]">{inspectedTable}</p>
              <div className="mt-3 space-y-2">
                {inspectedEngine && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[--muted]">Engine</span>
                    <span className="rounded bg-[--surface-hover] px-1.5 py-0.5 font-mono text-[11px] text-[--muted-fg]">{inspectedEngine}</span>
                  </div>
                )}
                {inspectedRows && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[--muted]">Total rows</span>
                    <span className="text-[--muted-fg]">{Number(inspectedRows).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[--muted]">
                  Create table SQL
                </span>
                {inspectedDdl && !inspectLoading && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(inspectedDdl); }}
                    className="rounded px-1.5 py-0.5 text-[10px] text-[--muted] transition-colors hover:bg-[--surface-hover] hover:text-[--fg]"
                    title="Copy DDL"
                  >
                    Copy
                  </button>
                )}
              </div>
              {inspectLoading ? (
                <div className="flex items-center justify-center gap-2 py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-[--brand]" />
                  <span className="text-xs text-[--muted]">Loading...</span>
                </div>
              ) : (
                <div className="px-3 pb-3">
                  <pre className="overflow-x-auto whitespace-pre rounded-lg border border-[--border] bg-white p-3 font-mono text-[11px] leading-[1.6] text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                    <code>{inspectedDdl}</code>
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderTabs(active: Tab, setTab: (t: Tab) => void) {
  const tabs: { value: Tab; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      value: "agents",
      label: "AI Agents",
      icon: <Sparkles className="h-3.5 w-3.5" />,
    },
    {
      value: "clickhouse",
      label: "ClickHouse",
      icon: <Database className="h-3.5 w-3.5" />,
    },
    {
      value: "postgres",
      label: "PostgreSQL",
      icon: <Database className="h-3.5 w-3.5" />,
    },
    {
      value: "notebook",
      label: "Notebook",
      icon: <Terminal className="h-3.5 w-3.5" />,
      badge: "chDB",
    },
  ];

  const rendered = tabs.map((t) => (
    <button
      key={t.value}
      onClick={() => setTab(t.value)}
      className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
        active === t.value
          ? "border-[--brand] text-[--brand]"
          : "border-transparent text-[--muted] hover:text-[--fg]"
      }`}
    >
      {t.icon}
      {t.label}
      {t.badge && (
        <span className="rounded bg-amber-500/10 px-1 py-0.5 text-[9px] font-semibold text-amber-400">
          {t.badge}
        </span>
      )}
    </button>
  ));

  return (
    <>
      {rendered}
      <span className="ml-auto hidden text-[10px] text-[--muted] sm:block" style={{ opacity: 0.75 }}>
        Source: direct SQL on ClickHouse Cloud and Postgres, executed live (no cache)
      </span>
    </>
  );
}
