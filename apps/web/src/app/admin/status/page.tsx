"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Database,
  Bot,
  Activity,
  Server,
  Link2,
  ShieldCheck,
  Play,
  Square,
  Zap,
  Clock,
  Rows3,
  Radio,
  ExternalLink,
  Users,
  Eye,
  LogIn,
  BarChart3,
  Ban,
  Trash2,
  CheckCircle,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import { useUser } from "@/lib/user-context";
import { DEFAULT_PUBLIC_CONFIG, loadPublicConfig, productNames, usePublicConfig } from "@/lib/public-config";
import { startGenerator as globalStartGen, stopGenerator as globalStopGen, getGenSnapshot, subscribeGen } from "@/lib/gen-client-state";
import { startOtelSending, stopOtelSending, resumeOtelIfIntended, refreshCollectorStatus, getOtelSnapshot, subscribeOtel, type CollectorStatus } from "@/lib/otel-client-state";
import { fetchOtherActiveSessions, type OtherSessions } from "@/lib/presence";

interface Check {
  name: string;
  group: string;
  icon: typeof Database;
  status: "pass" | "fail" | "checking" | "warn";
  detail?: string;
  latency?: number;
  url?: string;
}

interface GenStatus {
  running: boolean;
  target: string;
  uptimeMs: number;
  totalRows: number;
  rowsPerSec: number;
  errors: number;
  lastError: string | null;
}

interface OtelCollectorInfo {
  collectorEndpoint: string;
  collectorUp: boolean;
  sdkInitialized: boolean;
}

interface OtelSendStatus {
  running: boolean;
  collectorStatus: CollectorStatus;
  uptimeMs: number;
  totalTraces: number;
  totalLogs: number;
  totalMetrics: number;
  totalSessions: number;
  errors: number;
  lastError: string | null;
}

type AdminTab = "system" | "users";

interface VerifiedUser {
  user_email: string;
  user_name: string;
  status: string;
  verified_at: string;
}

interface UsageAnalytics {
  kpis: { totalUsers: number; activeUsers7d: number; activeUsersToday: number; totalPageViews: number };
  recentLogins: { user_email: string; user_name: string; event_time: string; page_path: string }[];
  topPages: { page_path: string; views: number }[];
  topUsers: { user_email: string; user_name: string; visits: number; last_seen: string }[];
  dailyActivity: { day: string; logins: number; page_views: number }[];
}

let RUNTIME_LINKS = DEFAULT_PUBLIC_CONFIG.links;
if (typeof window !== "undefined") loadPublicConfig().then((c) => { RUNTIME_LINKS = c.links; });
const link = (u: string) => u || undefined;

export default function StatusPage() {
  const { googleUser } = useUser();
  const isSuperAdmin = googleUser?.isSuperAdmin === true;
  const cfg = usePublicConfig();
  const names = productNames(cfg);

  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  const [gen, setGen] = useState<GenStatus>(() => {
    const s = getGenSnapshot();
    return { running: s.running, target: s.target, uptimeMs: s.uptimeMs, totalRows: s.totalRows, rowsPerSec: s.rowsPerSec, errors: s.errors, lastError: s.lastError };
  });
  const [genTarget, setGenTarget] = useState<"clickhouse" | "postgres" | "both">("both");
  const [genMultiplier, setGenMultiplier] = useState(1);
  const [genLoading] = useState(false);
  const genClientRunning = gen.running;

  const [otel, setOtel] = useState<OtelCollectorInfo | null>(null);
  const [otelSend, setOtelSend] = useState<OtelSendStatus>(() => getOtelSnapshot());

  const [activeTab, setActiveTab] = useState<AdminTab>("system");
  const [usage, setUsage] = useState<UsageAnalytics | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [verifiedUsers, setVerifiedUsers] = useState<VerifiedUser[]>([]);
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null);

  const loadVerifiedUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setVerifiedUsers(data.users ?? []);
    } catch { /* ignore */ }
  }, []);

  const handleUserAction = useCallback(async (email: string, action: "block" | "unblock" | "delete") => {
    setUserActionLoading(email);
    try {
      await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, email }),
      });
      await loadVerifiedUsers();
    } catch { /* ignore */ }
    setUserActionLoading(null);
  }, [loadVerifiedUsers]);

  const loadUsage = useCallback(async () => {
    setUsageLoading(true);
    try {
      const [analyticsRes] = await Promise.all([
        fetch("/api/activity/analytics"),
        loadVerifiedUsers(),
      ]);
      const data = await analyticsRes.json() as UsageAnalytics;
      setUsage(data);
    } catch { /* ignore */ }
    setUsageLoading(false);
  }, [loadVerifiedUsers]);

  useEffect(() => {
    if (activeTab === "users" && !usage) loadUsage();
  }, [activeTab, usage, loadUsage]);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    const initial: Check[] = [
      { name: "ClickHouse", group: "Databases", icon: Database, status: "checking" },
      { name: "PostgreSQL", group: "Databases", icon: Database, status: "checking" },
      { name: "LibreChat", group: "Services", icon: Bot, status: "checking" },
      { name: "Langfuse", group: "Observability", icon: Activity, status: "checking" },
      { name: "ClickStack", group: "Observability", icon: Activity, status: "checking" },
      { name: "OTel Collector", group: "Observability", icon: Radio, status: "checking" },
      { name: "ClickShop MCP ClickHouse", group: "MCP", icon: Server, status: "checking" },
      { name: "ClickShop MCP PostgreSQL", group: "MCP", icon: Server, status: "checking" },
      { name: names.cdc, group: "Replication", icon: Link2, status: "checking" },
      { name: "Env Validation", group: "Config", icon: ShieldCheck, status: "checking" },
    ];
    setChecks(initial);

    try {
      const [healthRes, otelRes] = await Promise.all([
        fetch("/api/health?detailed=true"),
        fetch("/api/otel/test"),
      ]);
      const data = await healthRes.json();
      const otelData = await otelRes.json() as OtelCollectorInfo;
      setOtel(otelData);

      setChecks([
        {
          name: "ClickHouse",
          group: "Databases",
          icon: Database,
          status: data.clickhouse ? "pass" : "fail",
          detail: data.clickhouse ? "Query OK" : data.clickhouseError ?? "Connection failed",
          latency: data.clickhouseLatency,
          url: link(RUNTIME_LINKS.clickhouseConsole),
        },
        {
          name: "PostgreSQL",
          group: "Databases",
          icon: Database,
          status: data.postgres ? "pass" : "fail",
          detail: data.postgres ? "Query OK" : data.postgresError ?? "Connection failed",
          latency: data.postgresLatency,
          url: link(RUNTIME_LINKS.postgresConsole),
        },
        {
          name: "LibreChat",
          group: "Services",
          icon: Bot,
          status: data.librechat ? "pass" : "fail",
          detail: data.librechat
            ? `Reachable at ${data.librechatUrl}`
            : `Not reachable at ${data.librechatUrl ?? "librechat"}`,
          url: data.librechatUrl || undefined,
        },
        {
          name: "Langfuse",
          group: "Observability",
          icon: Activity,
          status: data.langfuse ? "pass" : data.langfuseConfigured ? "fail" : "warn",
          detail: data.langfuse
            ? "Connected"
            : data.langfuseConfigured
              ? "Config present but connection failed"
              : "Not configured — optional",
          url: link(RUNTIME_LINKS.langfuse),
        },
        {
          name: "ClickStack",
          group: "Observability",
          icon: Activity,
          status: "pass",
          detail: "Logs, Traces & Metrics via OTel Collector",
          url: link(RUNTIME_LINKS.clickstack),
        },
        {
          name: "OTel Collector",
          group: "Observability",
          icon: Radio,
          status: (data.otelCollector || otelData.collectorUp) ? "pass" : "warn",
          detail: (data.otelCollector || otelData.collectorUp)
            ? `Running at ${otelData.collectorEndpoint}`
            : `Not reachable at ${otelData.collectorEndpoint}`,
        },
        {
          name: "ClickShop MCP ClickHouse",
          group: "MCP",
          icon: Server,
          status: data.mcpClickhouse ? "pass" : "warn",
          detail: data.mcpClickhouse ? "Endpoint reachable" : "Not configured or unreachable",
        },
        {
          name: "ClickShop MCP PostgreSQL",
          group: "MCP",
          icon: Server,
          status: data.mcpPostgres ? "pass" : "warn",
          detail: data.mcpPostgres ? "Endpoint reachable" : "Not configured or unreachable",
        },
        {
          name: names.cdc,
          group: "Replication",
          icon: Link2,
          status: data.clickpipes ? "pass" : "warn",
          detail: data.clickpipesDetail ?? "CDC mirror not found",
          url: link(RUNTIME_LINKS.cdc),
        },
        {
          name: "Env Validation",
          group: "Config",
          icon: ShieldCheck,
          status: data.envValid ? "pass" : "warn",
          detail: data.envValid ? "All required variables present" : data.envErrors?.join(", ") ?? "Validation failed",
        },
      ]);
    } catch (err) {
      setChecks((prev) =>
        prev.map((c) => ({
          ...c,
          status: "fail" as const,
          detail: `Health endpoint error: ${(err as Error).message}`,
        })),
      );
    }

    setRunning(false);
    setLastRun(new Date().toLocaleTimeString());
  }, [names.cdc]);

  useEffect(() => {
    runDiagnostics();
  }, [runDiagnostics]);

  useEffect(() => {
    const unsub = subscribeGen(() => {
      const s = getGenSnapshot();
      setGen({ running: s.running, target: s.target, uptimeMs: s.uptimeMs, totalRows: s.totalRows, rowsPerSec: s.rowsPerSec, errors: s.errors, lastError: s.lastError });
    });
    return unsub;
  }, []);

  // Stop-confirmation dialog state. Which card is asking, plus who else is
  // active right now (fetched when the dialog opens).
  const [confirmStop, setConfirmStop] = useState<"generator" | "otel" | null>(null);
  const [otherSessions, setOtherSessions] = useState<OtherSessions | null>(null);

  const openStopConfirm = useCallback((target: "generator" | "otel") => {
    setConfirmStop(target);
    setOtherSessions(null);
    fetchOtherActiveSessions()
      .then(setOtherSessions)
      .catch(() => setOtherSessions({ count: 0, labels: [] }));
  }, []);

  const startGen = useCallback(() => {
    globalStartGen(genTarget, genMultiplier);
  }, [genTarget, genMultiplier]);

  const stopGen = useCallback(() => {
    globalStopGen();
  }, []);

  useEffect(() => {
    refreshCollectorStatus().then(() => resumeOtelIfIntended());
    const unsub = subscribeOtel(() => setOtelSend(getOtelSnapshot()));
    setOtelSend(getOtelSnapshot());
    return unsub;
  }, []);

  const toggleOtel = (action: "start" | "stop") => {
    if (action === "start") startOtelSending();
    else stopOtelSending();
  };

  const statusIcon = (s: Check["status"]) => {
    if (s === "checking") return <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />;
    if (s === "pass") return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
    if (s === "warn") return <CheckCircle2 className="h-5 w-5 text-amber-400" />;
    return <XCircle className="h-5 w-5 text-red-400" />;
  };

  const groups = Array.from(new Set(checks.map((c) => c.group)));
  const passCount = checks.filter((c) => c.status === "pass").length;
  const total = checks.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[--fg]">System Diagnostics</h1>
          <p className="text-sm text-[--muted]">
            Environment validation, connectivity & usage analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === "system" && lastRun && <span className="text-xs text-[--muted]">Last run: {lastRun}</span>}
          <a
            href={cfg.links.langfuse || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-[--border] bg-[--surface-solid] px-4 py-2 text-sm font-medium text-[--muted-fg] hover:bg-[--surface-hover] hover:text-[--fg] transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Langfuse
          </a>
          <a
            href={cfg.links.clickstack || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-[--border] bg-[--surface-solid] px-4 py-2 text-sm font-medium text-[--muted-fg] hover:bg-[--surface-hover] hover:text-[--fg] transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            ClickStack
          </a>
          {activeTab === "system" ? (
            <button
              onClick={runDiagnostics}
              disabled={running}
              className="flex items-center gap-1.5 rounded-lg bg-brand-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-brand-300 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} />
              Re-run
            </button>
          ) : (
            <button
              onClick={loadUsage}
              disabled={usageLoading}
              className="flex items-center gap-1.5 rounded-lg bg-brand-400 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-brand-300 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${usageLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Tabs — only show if super admin */}
      {isSuperAdmin && (
        <div className="flex gap-1 rounded-lg border border-[--border] bg-[--surface] p-1">
          {([
            { id: "system" as AdminTab, label: "System", icon: ShieldCheck },
            { id: "users" as AdminTab, label: "Users & Sessions", icon: Users },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === t.id
                  ? "bg-[--brand-dim] text-[--brand]"
                  : "text-[--muted] hover:text-[--fg]"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === "system" && (<>
      {/* ─── Top panels: Data Generator + OTel Sender ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Data Generator */}
        <div className="rounded-xl border border-[--border] bg-[--surface] p-5 transition-colors">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2.5 ${genClientRunning ? "bg-emerald-500/10" : "bg-[--surface-hover]"}`}>
              <Zap className={`h-5 w-5 ${genClientRunning ? "text-emerald-400 animate-pulse" : "text-[--muted]"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[--fg] flex items-center gap-2">
                Data Generator
                {genClientRunning && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Running
                  </span>
                )}
              </p>
              <p className="text-xs text-[--muted]">Client-driven batching — ~160 CH + ~70 PG rows/batch</p>
            </div>
          </div>

          {genClientRunning && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-[--muted]"><Rows3 className="h-3 w-3" /> Total</div>
                <p className="text-sm font-bold text-[--fg]">{gen.totalRows.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-[--muted]"><Zap className="h-3 w-3" /> Rows/s</div>
                <p className="text-sm font-bold text-[--brand]">{gen.rowsPerSec.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-[--muted]"><Clock className="h-3 w-3" /> Uptime</div>
                <p className="text-sm font-bold text-[--fg]">{Math.floor(gen.uptimeMs / 1000)}s</p>
              </div>
            </div>
          )}

          {gen.lastError && (
            <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5">
              <p className="text-xs text-red-400 truncate"><span className="font-medium">Error ({gen.errors}):</span> {gen.lastError}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              value={genTarget}
              onChange={(e) => setGenTarget(e.target.value as typeof genTarget)}
              disabled={genClientRunning}
              className="rounded-lg border border-[--border] bg-[--surface-solid] px-2.5 py-1.5 text-xs text-[--muted-fg] disabled:opacity-50"
            >
              <option value="both">CH + PG</option>
              <option value="clickhouse">ClickHouse</option>
              <option value="postgres">PostgreSQL</option>
            </select>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-[--muted] whitespace-nowrap">Rows/batch</label>
              <select
                value={genMultiplier}
                onChange={(e) => setGenMultiplier(Number(e.target.value))}
                disabled={genClientRunning}
                className="rounded-lg border border-[--border] bg-[--surface-solid] px-2 py-1.5 text-xs text-[--muted-fg] disabled:opacity-50"
              >
                <option value={0.5}>0.5x (~500)</option>
                <option value={1}>1x (~1k)</option>
                <option value={2}>2x (~2k)</option>
                <option value={5}>5x (~5k)</option>
                <option value={10}>10x (~10k)</option>
                <option value={20}>20x (~20k)</option>
              </select>
            </div>
            {!genClientRunning ? (
              <button onClick={startGen} disabled={genLoading}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50">
                <Play className="h-3.5 w-3.5" /> Start
              </button>
            ) : (
              <button onClick={() => openStopConfirm("generator")}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-red-400 disabled:opacity-50">
                <Square className="h-3.5 w-3.5" /> Stop
              </button>
            )}
          </div>
        </div>

        {/* OTel Signal Sender */}
        <div className="rounded-xl border border-[--border] bg-[--surface] p-5 transition-colors">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2.5 ${otelSend.running ? "bg-blue-500/10" : "bg-[--surface-hover]"}`}>
              <Radio className={`h-5 w-5 ${otelSend.running ? "text-blue-400 animate-pulse" : "text-[--muted]"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[--fg] flex items-center gap-2">
                OpenTelemetry
                {otelSend.running && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-400/10 px-2 py-0.5 text-xs font-medium text-blue-400">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
                    Sending
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  otelSend.collectorStatus === "running"
                    ? "bg-emerald-400/10 text-emerald-400"
                    : otelSend.collectorStatus === "starting" || otelSend.collectorStatus === "stopping"
                      ? "bg-blue-400/10 text-blue-400"
                      : "bg-amber-400/10 text-amber-400"
                }`}>
                  {otelSend.collectorStatus === "running" && "Collector up"}
                  {otelSend.collectorStatus === "starting" && "Collector starting…"}
                  {otelSend.collectorStatus === "stopping" && "Collector stopping…"}
                  {otelSend.collectorStatus === "stopped" && "Collector stopped"}
                  {otelSend.collectorStatus === "unknown" && "Collector unknown"}
                </span>
              </p>
              <p className="text-xs text-[--muted]">Demo signals → always-on OTel collector → ClickStack (otel_* tables)</p>
            </div>
          </div>

          {otelSend.running && (
            <div className="mt-3 grid grid-cols-5 gap-2">
              <div className="rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-center">
                <div className="text-[10px] text-[--muted]">Traces</div>
                <p className="text-sm font-bold text-blue-400">{otelSend.totalTraces.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-center">
                <div className="text-[10px] text-[--muted]">Logs</div>
                <p className="text-sm font-bold text-violet-400">{otelSend.totalLogs.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-center">
                <div className="text-[10px] text-[--muted]">Metrics</div>
                <p className="text-sm font-bold text-emerald-400">{otelSend.totalMetrics.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-center">
                <div className="text-[10px] text-[--muted]">Sessions</div>
                <p className="text-sm font-bold text-amber-400">{otelSend.totalSessions.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-center">
                <div className="flex items-center justify-center gap-1 text-[10px] text-[--muted]"><Clock className="h-3 w-3" /> Uptime</div>
                <p className="text-sm font-bold text-[--fg]">{Math.floor(otelSend.uptimeMs / 1000)}s</p>
              </div>
            </div>
          )}

          {otelSend.lastError && (
            <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-1.5">
              <p className="text-xs text-red-400 truncate"><span className="font-medium">Error ({otelSend.errors}):</span> {otelSend.lastError}</p>
            </div>
          )}

          <div className="mt-3">
            {otelSend.collectorStatus === "starting" || otelSend.collectorStatus === "stopping" ? (
              <button disabled
                className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white opacity-60 transition-colors">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {otelSend.collectorStatus === "starting" ? "Starting collector…" : "Stopping collector…"}
              </button>
            ) : !otelSend.running ? (
              <button onClick={() => toggleOtel("start")}
                className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-400 disabled:opacity-50 transition-colors">
                <Play className="h-3.5 w-3.5" /> Start Sending
              </button>
            ) : (
              <button onClick={() => openStopConfirm("otel")}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-red-400 disabled:opacity-50 transition-colors">
                <Square className="h-3.5 w-3.5" /> Stop Sending
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-xl border border-[--border] bg-[--surface] p-4 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`text-3xl font-bold ${passCount === total ? "text-emerald-400" : passCount > total / 2 ? "text-amber-400" : "text-red-400"}`}>
            {passCount}/{total}
          </div>
          <div>
            <p className="font-medium text-[--fg]">
              {passCount === total ? "All systems operational" : `${passCount} of ${total} checks passed`}
            </p>
            <p className="text-sm text-[--muted]">
              {checks.filter((c) => c.status === "warn").length > 0 && "Some optional services are not configured. "}
              {checks.filter((c) => c.status === "fail").length > 0 && "Some required services need attention."}
              {passCount === total && "Everything looks good for the demo."}
            </p>
          </div>
        </div>
      </div>

      {/* Checks by group */}
      {groups.map((group) => (
        <div key={group}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[--muted]">{group}</h2>
          <div className="space-y-2">
            {checks
              .filter((c) => c.group === group)
              .map((check) => (
                <div
                  key={check.name}
                  className="flex items-center justify-between rounded-xl border border-[--border] bg-[--surface] px-5 py-4 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {statusIcon(check.status)}
                    <div>
                      <p className="font-medium text-[--fg]">{check.name}</p>
                      {check.detail && <p className="text-sm text-[--muted]">{check.detail}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {check.url && (
                      <a
                        href={check.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 rounded-lg border border-[--border] px-2.5 py-1 text-xs font-medium text-[--muted-fg] transition-colors hover:bg-[--surface-hover] hover:text-[--fg]"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Open
                      </a>
                    )}
                    {check.latency !== undefined && (
                      <span className="text-xs text-[--muted]">{check.latency}ms</span>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
      </>)}

      {/* ─── Users & Sessions tab (super admin only) ─── */}
      {isSuperAdmin && activeTab === "users" && (
        <>
          {usageLoading && !usage ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[--muted]" />
            </div>
          ) : usage ? (
            <>
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {[
                  { label: "Total Users", value: usage.kpis.totalUsers, icon: Users, color: "text-violet-400" },
                  { label: "Active (7d)", value: usage.kpis.activeUsers7d, icon: LogIn, color: "text-blue-400" },
                  { label: "Active Today", value: usage.kpis.activeUsersToday, icon: Activity, color: "text-emerald-400" },
                  { label: "Page Views", value: usage.kpis.totalPageViews, icon: Eye, color: "text-amber-400" },
                ].map((kpi) => (
                  <div key={kpi.label} className="rounded-xl border border-[--border] bg-[--surface] p-5 transition-colors">
                    <div className="flex items-center gap-2 text-xs text-[--muted]">
                      <kpi.icon className="h-3.5 w-3.5" />
                      {kpi.label}
                    </div>
                    <p className={`mt-1 text-2xl font-bold ${kpi.color}`}>{kpi.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {/* Two-column: Recent logins + Top users */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Recent logins */}
                <div className="rounded-xl border border-[--border] bg-[--surface] transition-colors">
                  <div className="flex items-center gap-2 border-b border-[--border] px-5 py-3">
                    <LogIn className="h-4 w-4 text-[--brand]" />
                    <span className="text-sm font-semibold text-[--fg]">Recent Logins</span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {usage.recentLogins.length === 0 ? (
                      <p className="px-5 py-8 text-center text-sm text-[--muted]">No logins recorded yet</p>
                    ) : (
                      usage.recentLogins.map((login, i) => (
                        <div key={i} className="flex items-center gap-3 border-b border-[--border-subtle] px-5 py-3 last:border-0">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-400">
                            {(login.user_name || login.user_email).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[--fg] truncate">{login.user_name || login.user_email}</p>
                            <p className="text-[11px] text-[--muted] truncate">{login.user_email}</p>
                          </div>
                          <span className="shrink-0 text-[11px] text-[--muted]">
                            {new Date(login.event_time).toLocaleString()}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Top users */}
                <div className="rounded-xl border border-[--border] bg-[--surface] transition-colors">
                  <div className="flex items-center gap-2 border-b border-[--border] px-5 py-3">
                    <BarChart3 className="h-4 w-4 text-[--brand]" />
                    <span className="text-sm font-semibold text-[--fg]">Top Users</span>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {usage.topUsers.length === 0 ? (
                      <p className="px-5 py-8 text-center text-sm text-[--muted]">No data yet</p>
                    ) : (
                      usage.topUsers.map((u, i) => (
                        <div key={i} className="flex items-center gap-3 border-b border-[--border-subtle] px-5 py-3 last:border-0">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[--surface-hover] text-[10px] font-bold text-[--muted-fg]">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-[--fg] truncate">{u.user_name || u.user_email}</p>
                            <p className="text-[11px] text-[--muted] truncate">{u.user_email}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-[--brand]">{u.visits}</p>
                            <p className="text-[10px] text-[--muted]">events</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Verified Users Management */}
              <div className="rounded-xl border border-[--border] bg-[--surface] transition-colors">
                <div className="flex items-center gap-2 border-b border-[--border] px-5 py-3">
                  <ShieldAlert className="h-4 w-4 text-[--brand]" />
                  <span className="text-sm font-semibold text-[--fg]">Verified Users</span>
                  <span className="rounded-full bg-[--surface-hover] px-2 py-0.5 text-[10px] font-medium text-[--muted]">
                    {verifiedUsers.length}
                  </span>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {verifiedUsers.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-[--muted]">No verified users yet</p>
                  ) : (
                    verifiedUsers.map((u, i) => {
                      const isBlocked = u.status === "blocked";
                      const isSelf = u.user_email === googleUser?.email;
                      return (
                        <div key={i} className={`flex items-center gap-3 border-b border-[--border-subtle] px-5 py-3 last:border-0 ${isBlocked ? "opacity-60" : ""}`}>
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                            isBlocked ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
                          }`}>
                            {(u.user_name || u.user_email).charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-[--fg] truncate">{u.user_name || u.user_email}</p>
                              {isSelf && (
                                <span className="rounded-full bg-brand-400/10 px-1.5 py-0.5 text-[9px] font-bold text-brand-400">ADMIN</span>
                              )}
                              {isBlocked && (
                                <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-400">BLOCKED</span>
                              )}
                            </div>
                            <p className="text-[11px] text-[--muted] truncate">{u.user_email}</p>
                          </div>
                          <span className="shrink-0 text-[10px] text-[--muted]">
                            {new Date(u.verified_at).toLocaleDateString()}
                          </span>
                          {!isSelf && (
                            <div className="flex items-center gap-1 shrink-0">
                              {isBlocked ? (
                                <button
                                  onClick={() => handleUserAction(u.user_email, "unblock")}
                                  disabled={userActionLoading === u.user_email}
                                  className="flex items-center gap-1 rounded-lg border border-emerald-500/20 px-2 py-1 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
                                  title="Unblock"
                                >
                                  {userActionLoading === u.user_email ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                                  Unblock
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUserAction(u.user_email, "block")}
                                  disabled={userActionLoading === u.user_email}
                                  className="flex items-center gap-1 rounded-lg border border-amber-500/20 px-2 py-1 text-[11px] font-medium text-amber-400 transition-colors hover:bg-amber-500/10 disabled:opacity-50"
                                  title="Block"
                                >
                                  {userActionLoading === u.user_email ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                                  Block
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  if (confirm(`Delete ${u.user_email}? They will need to verify again.`)) {
                                    handleUserAction(u.user_email, "delete");
                                  }
                                }}
                                disabled={userActionLoading === u.user_email}
                                className="flex items-center gap-1 rounded-lg border border-red-500/20 px-2 py-1 text-[11px] font-medium text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Top Pages */}
              <div className="rounded-xl border border-[--border] bg-[--surface] transition-colors">
                <div className="flex items-center gap-2 border-b border-[--border] px-5 py-3">
                  <Eye className="h-4 w-4 text-[--brand]" />
                  <span className="text-sm font-semibold text-[--fg]">Most Visited Pages</span>
                </div>
                <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-3">
                  {usage.topPages.length === 0 ? (
                    <p className="col-span-full px-5 py-8 text-center text-sm text-[--muted]">No page views yet</p>
                  ) : (
                    usage.topPages.map((p, i) => {
                      const maxViews = usage.topPages[0]?.views ?? 1;
                      return (
                        <div key={i} className="border-b border-r border-[--border-subtle] px-5 py-3 last:border-b-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-[--fg] truncate">{p.page_path || "/"}</p>
                            <span className="shrink-0 ml-2 text-sm font-bold text-[--brand]">{p.views}</span>
                          </div>
                          <div className="mt-1.5 h-1 rounded-full bg-[--surface-hover] overflow-hidden">
                            <div className="h-full rounded-full bg-brand-400" style={{ width: `${(p.views / maxViews) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="py-20 text-center text-sm text-[--muted]">Failed to load usage data</p>
          )}
        </>
      )}

      {/* ─── Stop confirmation dialog (presence-aware) ─── */}
      {confirmStop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmStop(null)}>
          <div
            className="w-full max-w-md rounded-xl border border-[--border] bg-[--surface-solid] p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-amber-500/10 p-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[--fg]">
                  {confirmStop === "otel" ? "Stop OpenTelemetry?" : "Stop Data Generator?"}
                </p>
                <p className="mt-1 text-sm text-[--muted]">
                  {confirmStop === "otel"
                    ? "This stops the synthetic demo signals from this browser. The collector keeps running: real app telemetry continues flowing to ClickStack."
                    : "This stops data generation from this browser. Generated data feeds the shared demo databases."}
                </p>
                {otherSessions === null ? (
                  <p className="mt-3 flex items-center gap-2 text-sm text-[--muted]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking who else is online…
                  </p>
                ) : otherSessions.count > 0 ? (
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
                    <p className="text-sm font-medium text-amber-400">
                      ⚠️ {otherSessions.count} other {otherSessions.count === 1 ? "user is" : "users are"} connected right now.
                    </p>
                    {otherSessions.labels.length > 0 && (
                      <p className="mt-0.5 text-xs text-[--muted] truncate">
                        Active: {otherSessions.labels.join(", ")}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[--muted]">No other users are connected right now.</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setConfirmStop(null)}
                className="rounded-lg border border-[--border] bg-[--surface-solid] px-4 py-2 text-sm font-medium text-[--muted-fg] hover:bg-[--surface-hover] hover:text-[--fg] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmStop === "otel") toggleOtel("stop");
                  else stopGen();
                  setConfirmStop(null);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-red-400 transition-colors"
              >
                <Square className="h-3.5 w-3.5" /> Yes, stop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
