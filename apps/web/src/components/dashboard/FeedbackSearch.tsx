"use client";

import { useState } from "react";
import { Search, Loader2, Zap, Filter, Database, Star, Clock, Rows3, HardDrive, Layers, AlertTriangle } from "lucide-react";

type SearchMode = "fts" | "bloom" | "none";

interface FeedbackResult {
  feedback_id: string;
  product_name: string;
  category: string;
  rating: number;
  feedback_text: string;
  created_at: string;
}

interface SearchMetrics {
  serverTimeMs: number;
  wallTimeMs: number;
  rowsRead: number;
  bytesRead: number;
  granulesSelected: number | null;
  granulesTotal: number | null;
}

interface SearchResponse {
  mode: SearchMode;
  tokens: string[];
  totalMatches?: number;
  results?: FeedbackResult[];
  metrics?: SearchMetrics;
  timeout?: boolean;
  timeoutSeconds?: number;
  error?: string;
}

const MODES: { value: SearchMode; label: string; icon: typeof Zap; hint: string }[] = [
  { value: "fts", label: "Full-text search", icon: Zap, hint: "Inverted text index: looks up each token in a dictionary and reads only the matching granules." },
  { value: "bloom", label: "Bloom filter", icon: Filter, hint: "tokenbf_v1 skip index: a per-granule bloom filter of tokens prunes blocks that cannot match." },
  { value: "none", label: "No index", icon: Database, hint: "No secondary index: ClickHouse scans the full text column across all rows." },
];

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

export function FeedbackSearch({ accent = "emerald" }: { accent?: "amber" | "emerald" }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("fts");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ac = accent === "amber"
    ? { ring: "focus:border-amber-500", btn: "bg-amber-500 hover:bg-amber-600", chip: "bg-amber-500 text-white", text: "text-amber-600 dark:text-amber-400" }
    : { ring: "focus:border-emerald-500", btn: "bg-emerald-500 hover:bg-emerald-600", chip: "bg-emerald-500 text-white", text: "text-emerald-600 dark:text-emerald-400" };

  const runSearch = async (searchMode?: SearchMode) => {
    const m = searchMode ?? mode;
    if (!query.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim(), mode: m }),
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

  const activeHint = MODES.find((m) => m.value === mode)?.hint ?? "";

  return (
    <div className="rounded-xl border border-[--border] bg-[--surface] p-5 transition-colors" style={{ boxShadow: "0 2px 8px var(--card-shadow)" }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[--muted-fg]">Search customer feedback</h3>
        <span className="rounded-full bg-[--surface-hover] px-2.5 py-0.5 text-[10px] font-medium text-[--muted]">
          Customer reviews · ClickHouse index comparison
        </span>
      </div>
      <p className="mb-4 text-xs text-[--muted]">
        Same data, same table: three copies of the text column, each with a different index strategy. Run the same query in each mode to compare.
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
            placeholder='Try "battery", "delivery late", "MacBook screen"...'
            className={`w-full rounded-lg border border-[--border] bg-[--surface-solid] py-2 pl-9 pr-3 text-sm text-[--fg] placeholder:text-[--muted] focus:outline-none ${ac.ring}`}
          />
        </div>
        <button
          onClick={() => runSearch()}
          disabled={loading || !query.trim()}
          className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-50 ${ac.btn}`}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Search
        </button>
      </div>

      {/* Mode selector */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {MODES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => { setMode(value); if (query.trim()) runSearch(value); }}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              mode === value
                ? `border-transparent ${ac.chip}`
                : "border-[--border] bg-[--surface-solid] text-[--muted] hover:text-[--fg]"
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[--muted]">{activeHint}</p>

      {/* Error */}
      {error && (
        <div className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-500">{error}</div>
      )}

      {/* Timeout */}
      {response?.timeout && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs font-medium text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          Query exceeded the {response.timeoutSeconds}s limit in &quot;{MODES.find((m) => m.value === response.mode)?.label}&quot; mode. That is the point of this demo: try the same query with an index.
        </div>
      )}

      {/* Metrics banner */}
      {response?.metrics && !response.timeout && (
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            { icon: Clock, label: "ClickHouse time", value: formatTime(response.metrics.serverTimeMs), highlight: true },
            { icon: Rows3, label: "Rows scanned", value: response.metrics.rowsRead.toLocaleString("en-US") },
            { icon: HardDrive, label: "Data read", value: formatBytes(response.metrics.bytesRead) },
            {
              icon: Layers,
              label: "Granules read",
              value: response.metrics.granulesTotal
                ? `${response.metrics.granulesSelected?.toLocaleString("en-US")} / ${response.metrics.granulesTotal.toLocaleString("en-US")}`
                : "n/a",
            },
          ].map(({ icon: Icon, label, value, highlight }) => (
            <div key={label} className="flex items-center gap-2.5 rounded-lg border border-[--border] bg-[--surface-solid] px-3 py-2.5">
              <Icon className={`h-4 w-4 flex-shrink-0 ${highlight ? ac.text : "text-[--muted]"}`} />
              <div className="min-w-0">
                <p className="text-[10px] font-medium text-[--muted]">{label}</p>
                <p className={`truncate tabular-nums ${highlight ? `text-base font-extrabold ${ac.text}` : "text-sm font-bold text-[--fg]"}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {response && !response.timeout && response.results && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-[--muted]">
            <span className={`font-semibold ${ac.text}`}>{(response.totalMatches ?? 0).toLocaleString("en-US")}</span> matching reviews
            {response.results.length > 0 && ` — showing top ${response.results.length}`}
          </p>
          <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
            {response.results.map((r) => (
              <div key={r.feedback_id} className="rounded-lg border border-[--border-subtle] bg-[--surface-solid] px-3 py-2.5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[--fg]">{r.product_name}</span>
                  <span className="rounded-full bg-[--surface-hover] px-2 py-0.5 text-[10px] text-[--muted-fg]">{r.category}</span>
                  <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-500">
                    <Star className="h-3 w-3 fill-current" />
                    {r.rating}/5
                  </span>
                  <span className="ml-auto text-[10px] text-[--muted]">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-xs leading-relaxed text-[--muted-fg]">
                  <Highlighted text={r.feedback_text} tokens={response.tokens} />
                </p>
              </div>
            ))}
            {response.results.length === 0 && (
              <p className="py-6 text-center text-xs text-[--muted]">No reviews match this query.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
