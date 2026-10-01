"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { TracePlayground } from "@/components/copilot/TracePlayground";
import { useUser } from "@/lib/user-context";
import { personaEmail, usePublicConfig } from "@/lib/public-config";

type PersonaId = "ceo" | "sales" | "data" | "sre" | "ai";

const PERSONAS = [
  { id: "ceo" as PersonaId, label: "CEO", color: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300", activeColor: "bg-amber-500 text-white dark:bg-brand-400 dark:text-zinc-950" },
  { id: "sales" as PersonaId, label: "Sales", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300", activeColor: "bg-emerald-500 text-white dark:bg-emerald-500 dark:text-zinc-950" },
  { id: "data" as PersonaId, label: "Data", color: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-300", activeColor: "bg-violet-500 text-white dark:bg-violet-500 dark:text-zinc-950" },
  { id: "sre" as PersonaId, label: "SRE", color: "bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300", activeColor: "bg-rose-500 text-white dark:bg-rose-500 dark:text-zinc-950" },
  { id: "ai" as PersonaId, label: "AI Engineer", color: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300", activeColor: "bg-sky-500 text-white dark:bg-sky-500 dark:text-zinc-950" },
];

const PERSONA_SPEC: Record<PersonaId, string> = {
  ceo: "clickshop-ceo-agent",
  sales: "clickshop-sales-agent",
  data: "clickshop-data-agent",
  sre: "clickshop-sre-agent",
  ai: "clickshop-ai-engineer-agent",
};

// LibreChat account per persona tab. The iframe must log in as the persona's
// own user (not the app-level user, which is admin@clickshop.io by default).
const PERSONA_EMAIL: Record<PersonaId, string> = {
  ceo: "ceo@clickshop.io",
  sales: "sales@clickshop.io",
  data: "data@clickshop.io",
  sre: "sre@clickshop.io",
  ai: "ai-engineer@clickshop.io",
};

// Conversation starters shown above the LibreChat iframe, per persona.
const PERSONA_CHAT_EXAMPLES: Record<PersonaId, string[]> = {
  ceo: [
    "How is revenue trending today vs last week?",
    "Top 5 products by revenue this month — chart it",
    "What is our biggest business risk right now?",
  ],
  sales: [
    "Which VIP customers should we contact this week?",
    "Where are payment failures costing us sales?",
    "Top customers by revenue this month, with trend",
  ],
  data: [
    "Query ClickHouse: top 5 products by revenue today, then build a chart",
    "Compare row counts between Postgres and the CDC tables in ClickHouse",
    "Profile order_events: any NULLs, duplicates or freshness issues?",
  ],
  sre: [
    "Which API route has the worst p95 latency today?",
    "Show error-log volume by service over the last hour",
    "Are all instrumented services reporting traces right now?",
  ],
  ai: [
    "Which agent costs the most in tokens this week?",
    "Show the slowest LLM generations today and their traces",
    "How are our LLM-as-judge scores trending?",
  ],
};


/**
 * LibreChat iframe, mounted only once its container scrolls into view.
 * LibreChat autofocuses its chat input on load; if the iframe is mounted
 * while the user is at the top of the page, that focus steal makes the
 * browser scroll down to the iframe (~2s after load). Deferring the mount
 * until the frame is actually visible keeps the page at the top.
 */
function LazyLibreChatFrame({ src, title }: { src: string; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "120px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div ref={ref} className="h-[500px] w-full">
      {visible ? (
        <iframe
          src={src}
          key={src}
          title={title}
          tabIndex={-1}
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-[--muted]">
          Scroll here to load the chat…
        </div>
      )}
    </div>
  );
}

export default function CopilotPage() {
  const { user } = useUser();
  const isAdmin = user.id === "admin";

  const defaultPersona: PersonaId = isAdmin ? "ceo" : (user.id as PersonaId);
  const [activePersona, setActivePersona] = useState<PersonaId>(defaultPersona);

  const visiblePersonas = isAdmin ? PERSONAS : PERSONAS.filter((p) => p.id === user.id);
  const currentPersona = visiblePersonas.find((p) => p.id === activePersona) ?? visiblePersonas[0];

  const publicConfig = usePublicConfig();
  const iframeParams = new URLSearchParams({
    email: personaEmail(publicConfig, PERSONA_EMAIL[currentPersona.id]),
    spec: PERSONA_SPEC[currentPersona.id],
    source: "copilot-page",
    persona: currentPersona.id,
  });
  const autoLoginPassword = publicConfig.librechat.autoLoginPassword;
  if (autoLoginPassword) {
    iframeParams.set("password", autoLoginPassword);
  }
  const iframeSrc = `${publicConfig.librechat.url.replace(/\/$/, "")}/auto-login.html?${iframeParams.toString()}`;

  return (
    <div className="space-y-6 p-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-500">
            <Bot className="h-5 w-5 text-zinc-950" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[--fg]">AI Agents</h1>
            <p className="text-xs text-[--muted]">
              {isAdmin
                ? "6 use-case agents on live ClickHouse data: each demonstrates one Langfuse tracing level, from a single GENERATION to a full multi-agent orchestra with tools, Mastra and LLM-as-a-Judge."
                : `6 agents tailored to the ${user.label} role, one per Langfuse tracing level: from a single GENERATION to a full multi-agent orchestra with tools, Mastra and LLM-as-a-Judge.`}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[--border] bg-[--surface] px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[--muted]">
          6 agents
        </span>
      </div>

      <TracePlayground persona={isAdmin ? undefined : user.id} />

      <div className="rounded-xl border border-[--border] bg-[--surface] overflow-hidden" style={{ boxShadow: "0 2px 8px var(--card-shadow)" }}>
        <div className="flex items-center gap-2 border-b border-[--border] bg-[--surface-solid] px-4 py-3">
          <Bot className="h-4 w-4 text-[--brand]" />
          <span className="text-sm font-semibold text-[--fg]">LibreChat — {currentPersona.label} persona</span>
          {isAdmin && (
            <div className="ml-3 flex items-center gap-1.5">
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setActivePersona(p.id)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    activePersona === p.id ? p.activeColor : p.color
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  {p.label}
                </button>
              ))}
            </div>
          )}
          <span className="ml-auto text-[10px] text-[--muted]">MCP tools (ClickHouse + Postgres), traced in Langfuse</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-b border-[--border] bg-[--surface-solid] px-4 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[--muted]">Try in chat:</span>
          {PERSONA_CHAT_EXAMPLES[currentPersona.id].map((ex) => (
            <span
              key={ex}
              className="rounded-full border border-[--border] bg-[--surface-hover] px-2.5 py-1 text-[10px] text-[--muted-fg]"
            >
              {ex}
            </span>
          ))}
        </div>
        {autoLoginPassword ? <LazyLibreChatFrame src={iframeSrc} title={`LibreChat ${currentPersona.label}`} /> : <div className="flex h-[500px] items-center justify-center text-xs text-[--muted]">Loading chat…</div>}
      </div>
    </div>
  );
}
