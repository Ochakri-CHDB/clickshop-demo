"use client";

import { useState } from "react";
import { Search, Loader2, Clock, Rows3, HardDrive, ExternalLink, ScrollText } from "lucide-react";
import { usePublicConfig } from "@/lib/public-config";

// Full-text log search over otel_logs, backed by /api/logs/search
// (hasAnyTokens + full-text index TYPE text on Body).

type Severity = "all" | "error" | "warn" | "info";

interface LogResult {
  timestamp: string;
  severity: string;
  service: string;
  body: string;
  trace_id: string;
}

interface SearchMetrics {
  serverTimeMs: number;
  wallTimeMs: number;
  rowsRead: number;
  bytesRead: number;
}

interface SearchResponse {
  tokens: string[];
  totalMatches?: number;
  results?: LogResult[];
  metrics?: SearchMetrics;
  error?: string;
}

const SEVERITIES: { value: Severity; label: string }[] = [
  { value: "all", label: "All" },
  { value: "error", label: "Error" },
  { value: "warn", label: "Warn" },
  { value: "info", label: "Info" },
];

const RANGES = [
  { value: "1h", label: "1h" },
  { value: "6h", label: "6h" },
  { value: "1d", label: "24h" },
  { value: "7d", label: "7d" },
];

// Verified against otel_logs: each returns matches in the default 24h window.
const EXAMPLES = ["slow query", "payment webhook", "cache miss", "session started"];

function hyperdxSearchUrl(base: string, query: string): string {
  if (!base) return "#";
  const url = /\/search(\?|$)/.test(base) ? base : `${base.replace(/\/$/, "")}/search`;
  return `${url}${url.includes("?") ? "&" : "?"}q=${encodeURIComponent(query)}`;
}

const SEVERITY_STYLES: Record<string, string> = {
  ERROR: "bg-red-500/15 text-red-600 dark:text-red-400",
  WARN: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  INFO: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  UNSET: "bg-[--surface-hover] text-[--muted]",
};

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatTime(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(ms < 10 ? 1 : 0)} ms`;
}

function Highlighted({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{text}</>;
  const pattern = new RegExp(`\\b(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "")).join("|")})\\b`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        tokens.some((t) => t.toLowerCase() === part.toLowerCase()) ? (
          <mark key={i} className="rounded bg-[#FAFF69] px-0.5 font-semibold text-neutral-900">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export function LogSearch() {
  const publicConfig = usePublicConfig();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<Severity>("all");
  const [range, setRange] = useState("1d");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (opts?: { severity?: Severity; range?: string; query?: string }) => {
    const q = (opts?.query ?? query).trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/logs/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          severity: opts?.severity ?? severity,
          range: opts?.range ?? range,
        }),
      });
      const d: SearchResponse = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Search failed");
      setResponse(d);
    } catch (err) {
      setResponse(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-[--border] bg-[--surface] p-5 transition-colors" style={{ boxShadow: "0 2px 8px var(--card-shadow)" }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[--muted-fg]">
          <ScrollText className="h-4 w-4 text-rose-500" />
          Search logs
        </h3>
        <span className="rounded-full bg-[--surface-hover] px-2.5 py-0.5 text-[10px] font-medium text-[--muted]">
          otel_logs · full-text index on Body
        </span>
      </div>
      <p className="mb-4 text-xs text-[--muted]">
        Full-text search across log bodies. An inverted text index on Body looks up each token in a dictionary and reads only the matching granules.
      </p>

      {/* Search bar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[--muted]" />
          <input
            type="text"
            value={query}
            maxLength={100}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder="Search log bodies, e.g. slow query, payment webhook..."
            className="w-full rounded-lg border border-[--border] bg-[--surface-solid] py-2 pl-9 pr-3 text-sm text-[--fg] placeholder:text-[--muted] focus:border-rose-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => runSearch()}
          disabled={loading || !query.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </div>

      {/* Example searches */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-[--muted]">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => { setQuery(ex); runSearch({ query: ex }); }}
            className="rounded-full border border-rose-600/25 bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Filters: severity + range */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {SEVERITIES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setSeverity(value); if (query.trim()) runSearch({ severity: value }); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                severity === value
                  ? "border-transparent bg-rose-500 text-white"
                  : "border-[--border] bg-[--surface-solid] text-[--muted] hover:text-[--fg]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="h-4 w-px bg-[--border]" />
        <div className="flex items-center gap-1.5">
          {RANGES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setRange(value); if (query.trim()) runSearch({ range: value }); }}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                range === value
                  ? "border-rose-600/30 bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"
                  : "border-[--border] bg-[--surface-solid] text-[--muted] hover:text-[--fg]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-500">{error}</div>
      )}

      {/* Metrics banner */}
      {response?.metrics && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { icon: Clock, label: "ClickHouse time", value: formatTime(response.metrics.serverTimeMs), highlight: true },
            { icon: Rows3, label: "Rows scanned", value: response.metrics.rowsRead.toLocaleString("en-US") },
            { icon: HardDrive, label: "Data read", value: formatBytes(response.metrics.bytesRead) },
          ].map(({ icon: Icon, label, value, highlight }) => (
            <div key={label} className="flex items-center gap-2.5 rounded-lg border border-[--border] bg-[--surface-solid] px-3 py-2.5">
              <Icon className={`h-4 w-4 flex-shrink-0 ${highlight ? "text-rose-600 dark:text-rose-400" : "text-[--muted]"}`} />
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-[--muted]">{label}</p>
                <p className={`truncate tabular-nums ${highlight ? "text-base font-extrabold text-rose-600 dark:text-rose-400" : "text-sm font-bold text-[--fg]"}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {response?.results && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-[--muted]">
            <span className="font-semibold text-rose-600 dark:text-rose-400">{(response.totalMatches ?? 0).toLocaleString("en-US")}</span> matching log lines
            {response.results.length > 0 && ` — showing latest ${response.results.length}`}
          </p>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {response.results.map((r, i) => (
              <div key={`${r.timestamp}-${i}`} className="rounded-lg border border-[--border-subtle] bg-[--surface-solid] px-3 py-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] tabular-nums text-[--muted]">{r.timestamp.slice(0, 23)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${SEVERITY_STYLES[r.severity] ?? SEVERITY_STYLES.UNSET}`}>
                    {r.severity}
                  </span>
                  <span className="rounded-full bg-[--surface-hover] px-2 py-0.5 text-[10px] text-[--muted-fg]">{r.service}</span>
                  {r.trace_id && (
                    <a
                      href={hyperdxSearchUrl(publicConfig.links.clickstack, `TraceId:"${r.trace_id}"`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto flex items-center gap-1 font-mono text-[10px] text-rose-600 hover:underline dark:text-rose-400"
                      title="Open trace in HyperDX"
                    >
                      {r.trace_id.slice(0, 12)}…
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  )}
                </div>
                <p className="break-all font-mono text-[11px] leading-relaxed text-[--muted-fg]">
                  <Highlighted text={r.body} tokens={response.tokens} />
                </p>
              </div>
            ))}
            {response.results.length === 0 && (
              <p className="py-6 text-center text-xs text-[--muted]">No log lines match this query in the selected window.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
