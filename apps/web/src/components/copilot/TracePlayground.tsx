"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Search,
  ShieldCheck,
  Layers,
  Coins,
  Zap,
  Loader2,
  Send,
  Gauge,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

interface PlaygroundAgent {
  id: string;
  level: number;
  label: string;
  pattern: string;
  description: string;
  traceTypes: string[];
  examples: string[];
  framework?: string;
}

interface JudgeScore {
  name: string;
  value: number | string | boolean;
  dataType: string;
  comment: string;
}

interface RunResult {
  output: string;
  traceId?: string;
  traceName: string;
  steps: Array<{ type: string; name: string; summary: string }>;
  judgeScores: JudgeScore[];
  judgeReasoning: string;
  durationMs: number;
  model: string;
}

/** One icon per orchestration level (agent ids vary per persona). */
const LEVEL_ICONS: LucideIcon[] = [Layers, Search, ShieldCheck, Activity, Coins, Zap];

const LEVEL_COLORS = [
  "#22c55e",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
];

const TYPE_COLORS: Record<string, string> = {
  GENERATION: "#3b82f6",
  CHAIN: "#8b5cf6",
  EVENT: "#64748b",
  EMBEDDING: "#06b6d4",
  RETRIEVER: "#10b981",
  EVALUATOR: "#f59e0b",
  AGENT: "#ec4899",
  TOOL: "#f97316",
  GUARDRAIL: "#ef4444",
};

function scoreBadge(score: JudgeScore) {
  const label = score.name.replace("llm_judge_", "");
  let display: string;
  let color = "#64748b";
  if (typeof score.value === "number") {
    display = score.value.toFixed(2);
    color = score.value >= 0.7 ? "#22c55e" : score.value >= 0.4 ? "#f59e0b" : "#ef4444";
  } else if (typeof score.value === "boolean") {
    display = score.value ? "yes" : "no";
    color = score.value ? "#22c55e" : "#ef4444";
  } else {
    display = String(score.value);
    color = display === "pass" ? "#22c55e" : display === "fail" ? "#ef4444" : "#f59e0b";
  }
  return (
    <span
      key={score.name}
      title={score.comment}
      className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
      style={{ borderColor: `${color}55`, color, background: `${color}14` }}
    >
      {label}: {display}
    </span>
  );
}

function PlaygroundCard({ agent }: { agent: PlaygroundAgent }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const Icon = LEVEL_ICONS[agent.level - 1] ?? Activity;
  const color = LEVEL_COLORS[agent.level - 1] ?? "#3b82f6";

  const run = async (text?: string) => {
    const q = (text ?? prompt).trim();
    if (!q || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/demo-agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, prompt: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data as RunResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[--border] bg-[--surface]">
      <div className="h-[2px] w-full" style={{ background: color }} />
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${color}20` }}
          >
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-sm font-semibold text-[--fg]">{agent.label}</h4>
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                style={{ background: color }}
              >
                Level {agent.level}
              </span>
              <span
                className="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                style={{ borderColor: `${color}55`, color }}
              >
                {agent.pattern}
              </span>
              {agent.framework && (
                <span className="rounded-full border border-[--border] px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[--muted]">
                  {agent.framework}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[--muted]">{agent.description}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {agent.traceTypes.map((t) => (
            <span
              key={t}
              className="rounded border px-1.5 py-0.5 text-[9px] font-semibold tracking-wide"
              style={{
                color: TYPE_COLORS[t] ?? "#64748b",
                borderColor: `${TYPE_COLORS[t] ?? "#64748b"}44`,
                background: `${TYPE_COLORS[t] ?? "#64748b"}10`,
              }}
            >
              {t}
            </span>
          ))}
        </div>

        {!result && !loading && (
          <div className="flex flex-wrap gap-1.5">
            {agent.examples.map((ex) => (
              <button
                key={ex}
                onClick={() => run(ex)}
                className="rounded-full border border-[--border] bg-[--surface-hover] px-2.5 py-1 text-left text-[10px] text-[--muted-fg] transition-colors hover:border-[--brand] hover:text-[--fg]"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" style={{ color }} />
            <span className="text-xs text-[--muted]">
              Running level {agent.level} pipeline… traces streaming to Langfuse
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-500">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-2.5">
            <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-[12px] leading-relaxed text-[--muted-fg]">
              {result.output}
            </div>

            {result.steps.length > 0 && (
              <details className="rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2">
                <summary className="flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[--muted]">
                  <ScrollText className="h-3 w-3" /> {result.steps.length} observations
                </summary>
                <ul className="mt-2 space-y-1">
                  {result.steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-[10px] text-[--muted-fg]">
                      <span
                        className="mt-0.5 shrink-0 rounded px-1 py-px text-[8px] font-bold"
                        style={{
                          color: TYPE_COLORS[s.type] ?? "#64748b",
                          background: `${TYPE_COLORS[s.type] ?? "#64748b"}15`,
                        }}
                      >
                        {s.type}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium text-[--fg]">{s.name}</span>{" "}
                        <span className="break-all">{s.summary}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {result.judgeScores.length > 0 && (
              <div className="rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[--muted]">
                  <Gauge className="h-3 w-3" /> LLM-as-a-Judge
                </div>
                <div className="flex flex-wrap gap-1.5">{result.judgeScores.map(scoreBadge)}</div>
                {result.judgeReasoning && (
                  <p className="mt-1.5 text-[10px] italic leading-relaxed text-[--muted]">
                    {result.judgeReasoning}
                  </p>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-[--muted]">
              <span>{(result.durationMs / 1000).toFixed(1)}s</span>
              <span>{result.model}</span>
              <span>trace: {result.traceName}</span>
              {result.traceId && (
                <span className="break-all font-mono" title="Search this ID in Langfuse → Traces">
                  {result.traceId}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="mt-auto flex gap-2 pt-1">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Or ask your own question…"
            className="flex-1 rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-[11px] text-[--fg] placeholder:text-[--muted] focus:border-[--brand] focus:outline-none"
          />
          <button
            onClick={() => run()}
            disabled={loading || !prompt.trim()}
            className="flex items-center justify-center rounded-lg border border-[--border] px-3 py-2 text-xs font-medium text-[--muted-fg] transition-all hover:text-[--fg] disabled:opacity-40"
            style={prompt.trim() ? { borderColor: color, color } : {}}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * @param persona active persona id (ceo | sales | data | sre | ai).
 *                Omit / "admin" → the 6 generic agents.
 */
export function TracePlayground({ persona }: { persona?: string }) {
  const [agents, setAgents] = useState<PlaygroundAgent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAgents(null);
    const qs = persona && persona !== "admin" ? `?persona=${encodeURIComponent(persona)}` : "";
    fetch(`/api/demo-agents${qs}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setAgents(data.agents ?? []);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [persona]);

  if (!agents) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-[--border] bg-[--surface] px-4 py-6 text-xs text-[--muted]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {agents.map((a) => (
          <PlaygroundCard key={a.id} agent={a} />
        ))}
      </div>
    </div>
  );
}
