"use client";

import { useState } from "react";
import { Loader2, Sparkles, RefreshCw, Send, type LucideIcon } from "lucide-react";

export interface AgentDef {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  persona: string;
  accentFrom: string;
  accentTo: string;
  iconBg: string;
  glowColor: string;
}

const QUICK_PROMPTS: Record<string, string[]> = {
  "ceo-risk-radar": ["What are the top risks today?", "Any fraud patterns?"],
  "ceo-growth-opportunities": ["Which regions are growing?", "Untapped categories?"],
  "ceo-competitive-intel": ["Pricing gaps vs market?", "Best performing channel?"],
  "ceo-customer-pulse": ["VIP customer health?", "Cart abandonment rate?"],
  "ceo-forecast": ["Revenue forecast this week?", "Trending categories?"],
  "fraud": ["Suspicious transactions?", "Card testing patterns?"],
  "sales-pipeline-review": ["Pipeline velocity?", "Conversion by channel?"],
  "sales-churn-alert": ["At-risk customers?", "Declining order patterns?"],
  "sales-deal-coach": ["Best cross-sell opportunities?", "Optimal pricing?"],
  "sales-territory-intel": ["Top countries this week?", "Emerging markets?"],
  "sales-pricing-optimizer": ["Price elasticity signals?", "Discount impact?"],
  "sales-competitor-tracker": ["Market share trends?", "Acquisition patterns?"],
  "data-anomaly-detector": ["Any anomalies today?", "Unusual traffic spikes?"],
  "data-pipeline-health": ["Ingestion lag?", "CDC replication status?"],
  "data-query-optimizer": ["Slow queries?", "Missing indexes?"],
  "data-schema-advisor": ["TTL recommendations?", "Codec improvements?"],
  "data-cost-analyzer": ["Storage hotspots?", "Cold data candidates?"],
  "data-data-quality": ["NULL rate check?", "Duplicate detection?"],
};

export function AgentCard({ agent }: { agent: AgentDef }) {
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const Icon = agent.icon;
  const prompts = QUICK_PROMPTS[agent.id] ?? [];

  const run = (extra?: string) => {
    setLoading(true);
    setResults([]);
    const q = extra || customPrompt;
    const url = `/api/analytics/recommendations?persona=${agent.persona}${q ? `&prompt=${encodeURIComponent(q)}` : ""}&source=agents-tab`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.recommendations?.length) {
          setResults(d.recommendations);
        } else {
          setResults(["No insights available — check API keys."]);
        }
      })
      .catch(() => setResults(["Connection error. Try again."]))
      .finally(() => setLoading(false));
  };

  const hasResults = results.length > 0;

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-[--border] bg-[--surface] transition-all duration-300 hover:shadow-md">
      <div
        className="h-[2px] w-full"
        style={{ background: `linear-gradient(90deg, ${agent.accentFrom}, ${agent.accentTo})` }}
      />

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: agent.iconBg }}
            >
              <Icon className="h-5 w-5" style={{ color: agent.accentFrom }} />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[--fg]">{agent.label}</h4>
              <p className="text-[11px] leading-relaxed text-[--muted]">{agent.description}</p>
            </div>
          </div>
        </div>

        {!hasResults && !loading && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {prompts.map((p) => (
              <button
                key={p}
                onClick={() => run(p)}
                className="rounded-full border border-[--border] bg-[--surface-hover] px-2.5 py-1 text-[10px] text-[--muted-fg] transition-colors hover:border-[--brand] hover:text-[--fg]"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1">
          {loading ? (
            <div className="flex items-center gap-2 py-6">
              <Loader2 className="h-4 w-4 animate-spin text-[--muted]" />
              <span className="text-xs text-[--muted]">Agent querying ClickHouse...</span>
            </div>
          ) : hasResults ? (
            <ul className="space-y-2">
              {results.map((r, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-[12px] leading-relaxed text-[--muted-fg]"
                >
                  <span
                    className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
                    style={{ background: `linear-gradient(135deg, ${agent.accentFrom}, ${agent.accentTo})` }}
                  >
                    {i + 1}
                  </span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center justify-center py-3 text-center">
              <Sparkles className="mb-1.5 h-4 w-4 text-[--muted]" style={{ opacity: 0.4 }} />
              <p className="text-[10px] text-[--muted]">Pick a question or type your own</p>
            </div>
          )}
        </div>

        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && run()}
            placeholder="Ask something specific..."
            className="flex-1 rounded-lg border border-[--border] bg-[--surface-hover] px-3 py-2 text-[11px] text-[--fg] placeholder:text-[--muted] focus:border-[--brand] focus:outline-none"
          />
          <button
            onClick={() => run()}
            disabled={loading}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-[--border] px-3 py-2 text-xs font-medium text-[--muted-fg] transition-all hover:bg-[--surface-solid] hover:text-[--fg] disabled:opacity-40"
            style={customPrompt ? { borderColor: agent.accentFrom, color: agent.accentFrom } : {}}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : hasResults ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : customPrompt ? (
              <Send className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AgentGrid({ agents }: { agents: AgentDef[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((a) => (
        <AgentCard key={a.id} agent={a} />
      ))}
    </div>
  );
}
