"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Bot,
  BrainCircuit,
  TrendingUp,
  Database,
  ArrowRight,
  ArrowUpRight,
  Loader2,
  Activity,
  Radio,
  Link2,
  LineChart,
  Workflow,
} from "lucide-react";
import { useUser } from "@/lib/user-context";
import { productNames, usePublicConfig } from "@/lib/public-config";

type Status = "connected" | "disconnected" | "checking";

interface Health {
  clickhouse: Status;
  postgres: Status;
  librechat: Status;
  langfuse: Status;
  otelCollector: Status;
  clickstack: Status;
  mcpClickhouse: Status;
  mcpPostgres: Status;
  mcpLangfuse: Status;
  mcpObservability: Status;
  clickpipes: Status;
  clickpipesDetail?: string;
}


// Kept in sync with apps/web/src/lib/demo-agents/index.ts (6 agents, one framework each).
const AGENT_FRAMEWORKS = [
  "Anthropic / OpenAI SDK",
  "LangChain.js",
  "LlamaIndex.TS",
  "Vercel AI SDK",
  "Mastra",
  "LangGraph.js",
];

const frontendCards = [
  { href: "/workspace/ceo", icon: TrendingUp, title: "CEO Workspace", description: "Executive KPIs & trends", gradient: "from-brand-400 to-yellow-300" },
  { href: "/workspace/sales", icon: BarChart3, title: "Sales Workspace", description: "Revenue & pipeline health", gradient: "from-emerald-400 to-teal-300" },
  { href: "/workspace/data", icon: Database, title: "Data Workspace", description: "SQL editor & notebook", gradient: "from-blue-400 to-cyan-300" },
  { href: "/copilot", icon: Bot, title: "AI Agents", description: "LibreChat + demo agents", gradient: "from-violet-500 to-purple-400" },
  { href: "/workspace/sre", icon: Activity, title: "SRE Workspace", description: "Latency, errors & logs", gradient: "from-rose-400 to-pink-300" },
  { href: "/workspace/ai", icon: BrainCircuit, title: "AI Engineer", description: "LLM traces, costs & evals", gradient: "from-sky-400 to-cyan-300" },
];

function StatusChip({ status, label }: { status: Status; label?: string }) {
  return (
    <span className="inline-flex flex-shrink-0 items-center gap-1 text-[10px] font-medium">
      {status === "checking" ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin text-[--muted]" />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${status === "connected" ? "bg-emerald-500" : "bg-red-400"}`} />
      )}
      <span
        className={
          status === "checking"
            ? "text-[--muted]"
            : status === "connected"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-500"
        }
      >
        {label ?? (status === "checking" ? "Checking" : status === "connected" ? "Connected" : "Down")}
      </span>
    </span>
  );
}

function McpChip({ status, label }: { status: Status; label: string }) {
  return (
    <span className="inline-flex w-full items-center justify-center gap-1.5 truncate rounded border border-[--border] bg-[--surface-solid] px-1.5 py-0.5 text-[9px] font-medium" title={label}>
      {status === "checking" ? (
        <Loader2 className="h-2 w-2 flex-shrink-0 animate-spin text-[--muted]" />
      ) : (
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${status === "connected" ? "bg-emerald-500" : "bg-red-400"}`} />
      )}
      <span className={`truncate ${status === "disconnected" ? "text-red-500" : "text-[--muted-fg]"}`}>{label}</span>
    </span>
  );
}

function LayerSection({
  label,
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-dashed border-[--border] px-3 pb-3 pt-2 sm:px-4 ${className}`}>
      <p className="mb-2 text-[9px] font-semibold uppercase tracking-wider text-[--brand]">{label}</p>
      {children}
    </section>
  );
}

function LayerConnector() {
  return (
    <div className="flex flex-col items-center" aria-hidden>
      <div className="h-2.5 w-px bg-[--border]" />
      <div className="-mt-px h-1 w-1 rotate-45 border-b border-r border-[--muted]" />
    </div>
  );
}

function FeatureRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-[--surface-hover] px-2 py-1">
      <span className="flex-shrink-0 text-[10px] font-semibold text-[--fg]">{label}</span>
      <span className="truncate text-[9px] text-[--muted]">{detail}</span>
    </div>
  );
}

const MEDALLION_TONES = {
  bronze: "border-orange-500/25 bg-orange-500/5 text-orange-700 dark:text-orange-400",
  silver: "border-slate-400/30 bg-slate-400/10 text-slate-600 dark:text-slate-300",
  gold: "border-amber-500/30 bg-amber-400/10 text-amber-700 dark:text-amber-400",
} as const;

function MedallionStage({
  tone,
  title,
  subtitle,
  tables,
  more,
}: {
  tone: keyof typeof MEDALLION_TONES;
  title: string;
  subtitle: string;
  tables: string[];
  more?: number;
}) {
  return (
    <div className={`flex-1 self-stretch rounded-lg border px-2 py-1.5 text-center ${MEDALLION_TONES[tone]}`}>
      <p className="text-[10px] font-bold">{title}</p>
      <p className="text-[9px] opacity-80">{subtitle}</p>
      <div className="mt-1 grid grid-cols-2 gap-1">
        {tables.map((t) => (
          <span key={t} className="truncate rounded border border-[--border] bg-[--surface-solid] px-1.5 py-0.5 text-center font-mono text-[9px] text-[--muted-fg]" title={t}>
            {t}
          </span>
        ))}
        {more ? (
          <span className="truncate rounded border border-[--border] bg-[--surface-solid] px-1.5 py-0.5 text-center font-mono text-[9px] font-semibold text-[--muted]">
            +{more} more
          </span>
        ) : null}
      </div>
    </div>
  );
}

function MedallionArrow() {
  return (
    <span className="flex-shrink-0 self-center text-xs text-[--muted] rotate-90 sm:rotate-0" aria-hidden>
      →
    </span>
  );
}

function ArchBlock({
  href,
  external,
  icon: Icon,
  title,
  subtitle,
  status,
  statusLabel,
  detail,
  large,
  className = "",
  children,
}: {
  href: string;
  external?: boolean;
  icon: typeof Database;
  title: string;
  subtitle: string;
  status?: Status;
  statusLabel?: string;
  detail?: string;
  large?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Icon className={`${large ? "h-4 w-4" : "h-3.5 w-3.5"} flex-shrink-0 text-[--muted] transition-colors duration-200 group-hover:text-[--brand]`} />
          <h3 className={`truncate ${large ? "text-sm" : "text-xs"} font-semibold text-[--fg]`}>{title}</h3>
          {external ? (
            <ArrowUpRight className="h-3 w-3 flex-shrink-0 text-[--muted] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
          ) : (
            <ArrowRight className="h-3 w-3 flex-shrink-0 text-[--muted] opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
          )}
        </div>
        {status && <StatusChip status={status} label={statusLabel} />}
      </div>
      <p className={`mt-0.5 ${large ? "text-[11px]" : "text-[10px]"} leading-snug text-[--muted] [text-wrap:balance]`}>{subtitle}</p>
      {detail && <p className="mt-0.5 truncate text-[10px] text-[--muted]" title={detail}>{detail}</p>}
      {children}
    </>
  );

  const cls = `group flex flex-col rounded-lg border border-[--border] bg-[--surface] ${large ? "px-4 py-3" : "px-3 py-2"} transition-all duration-200 hover:border-[--muted-fg]/25 hover:shadow-md ${className}`;
  const style = { boxShadow: "0 1px 2px var(--card-shadow)" };

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} style={style}>
      {inner}
    </Link>
  );
}

export default function HomePage() {
  const { user } = useUser();
  const cfg = usePublicConfig();
  const names = productNames(cfg);
  const link = (url: string) => ({ href: url || "/admin/status", external: Boolean(url) });
  const [health, setHealth] = useState<Health>({
    clickhouse: "checking",
    postgres: "checking",
    librechat: "checking",
    langfuse: "checking",
    otelCollector: "checking",
    clickstack: "checking",
    mcpClickhouse: "checking",
    mcpPostgres: "checking",
    mcpLangfuse: "checking",
    mcpObservability: "checking",
    clickpipes: "checking",
  });

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        const s = (ok: boolean): Status => (ok ? "connected" : "disconnected");
        setHealth({
          clickhouse: s(data.clickhouse),
          postgres: s(data.postgres),
          librechat: s(data.librechat),
          langfuse: s(data.langfuse),
          otelCollector: s(data.otelCollector),
          clickstack: s(data.clickstack),
          mcpClickhouse: s(data.mcpClickhouse),
          mcpPostgres: s(data.mcpPostgres),
          mcpLangfuse: s(data.mcpLangfuse),
          mcpObservability: s(data.mcpObservability),
          clickpipes: s(data.clickpipes),
          clickpipesDetail: data.clickpipesDetail,
        });
      })
      .catch(() => {
        setHealth({
          clickhouse: "disconnected",
          postgres: "disconnected",
          librechat: "disconnected",
          langfuse: "disconnected",
          otelCollector: "disconnected",
          clickstack: "disconnected",
          mcpClickhouse: "disconnected",
          mcpPostgres: "disconnected",
          mcpLangfuse: "disconnected",
          mcpObservability: "disconnected",
          clickpipes: "disconnected",
        });
      });
  }, []);

  const allNavItems = new Set(user.navItems);
  const visFrontend = frontendCards.filter((c) => allNavItems.has(c.href));

  const trackedStatuses = [
    health.clickhouse,
    health.postgres,
    health.librechat,
    health.langfuse,
    health.otelCollector,
    health.clickstack,
    health.mcpClickhouse,
    health.mcpPostgres,
    health.mcpLangfuse,
    health.mcpObservability,
    health.clickpipes,
  ];
  const connectedCount = trackedStatuses.filter((s) => s === "connected").length;
  const totalCount = trackedStatuses.length;
  const anyChecking = trackedStatuses.some((s) => s === "checking");
  const allConnected = !anyChecking && connectedCount === totalCount;

  return (
    <div className="space-y-1.5">
      {/* Compact title bar */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-bold tracking-tight text-[--fg] sm:text-lg">
          ClickShop <span className="font-normal text-[--muted]">— Demo Architecture</span>
        </h1>
        <div className="flex items-center gap-2 rounded-lg border border-[--border] bg-[--surface-solid] px-3 py-1.5">
          {anyChecking ? (
            <Loader2 className="h-4 w-4 animate-spin text-[--muted]" />
          ) : (
            <Activity className={`h-4 w-4 ${allConnected ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`} />
          )}
          <span className="text-xs font-medium text-[--muted]">Services</span>
          <span className={`text-xs font-semibold tabular-nums ${anyChecking ? "text-[--muted]" : allConnected ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
            {anyChecking ? "…" : `${connectedCount}/${totalCount}`}
          </span>
        </div>
      </div>

      {/* Layer 1 — Frontend */}
      {visFrontend.length > 0 && (
        <>
          <LayerSection label="Frontend — Next.js 14">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {visFrontend.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group flex items-center gap-2.5 rounded-lg border border-[--border] bg-[--surface] px-3 py-2 transition-all duration-200 hover:border-[--muted-fg]/25 hover:shadow-md"
                  style={{ boxShadow: "0 1px 2px var(--card-shadow)" }}
                >
                  <div className={`flex-shrink-0 rounded-md bg-gradient-to-br ${card.gradient} p-1.5 shadow-sm`}>
                    <card.icon className="h-3.5 w-3.5 text-zinc-950" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <h3 className="truncate text-xs font-semibold text-[--fg]">{card.title}</h3>
                      <ArrowRight className="h-3 w-3 flex-shrink-0 text-[--muted] opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </div>
                    <p className="truncate text-[10px] text-[--muted]">{card.description}</p>
                  </div>
                </Link>
              ))}
            </div>
          </LayerSection>
          <LayerConnector />
        </>
      )}

      {/* Middle band — Infra obs / Agentic / LLM obs */}
      <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-3 lg:gap-2">
        <LayerSection label="Infra Observability — ClickStack" className="flex flex-col">
          <ArchBlock
            {...link(cfg.links.clickstack)}
            icon={Activity}
            title={names.clickstack}
            subtitle="Is the app healthy? Where is the bottleneck?"
            status={health.clickstack}
            className="flex-1"
          >
            <div className="mt-1.5 flex flex-1 flex-col justify-evenly gap-1">
              <FeatureRow label="Traces" detail="distributed, end-to-end" />
              <FeatureRow label="Logs" detail="all services, full retention" />
              <FeatureRow label="Metrics" detail="CPU · memory · latency · errors" />
              <FeatureRow label="+ Session replay" detail="rrweb → ClickHouse" />
            </div>
          </ArchBlock>
        </LayerSection>

        <LayerSection label="Agentic Layer — LLM Apps" className="flex flex-col">
          <div className="flex flex-1 flex-col gap-1.5">
            <ArchBlock
              href="/copilot"
              icon={Workflow}
              title="Demo Agents — 6 frameworks"
              subtitle={`One agent per framework, all traced in Langfuse · ${names.llm}`}
              className="flex-1"
            >
              <div className="mt-1.5 grid flex-1 grid-cols-3 content-center gap-1 rounded-md border border-[--border] bg-[--surface-hover] p-1.5">
                {AGENT_FRAMEWORKS.map((fw) => (
                  <span key={fw} className="truncate rounded border border-[--border] bg-[--surface-solid] px-1.5 py-0.5 text-center text-[9px] font-medium text-[--muted-fg]" title={fw}>
                    {fw}
                  </span>
                ))}
              </div>
            </ArchBlock>
            <ArchBlock
              href="/copilot"
              icon={Bot}
              title="LibreChat"
              subtitle={`5 personas: CEO · Sales · Data · SRE · AI Engineer · ${names.llm}`}
              status={health.librechat}
              className="flex-1"
            >
              <div className="mt-1.5 flex-1 content-center rounded-md border border-[--border] bg-[--surface-hover] px-2 py-1.5">
                <p className="mb-1 text-center text-[9px] font-semibold uppercase tracking-wide text-[--muted]">MCP servers</p>
                <div className="grid grid-cols-2 gap-x-1 gap-y-1">
                  <McpChip status={health.mcpClickhouse} label={health.mcpClickhouse === "disconnected" ? "ClickHouse down" : "ClickHouse"} />
                  <McpChip status={health.mcpPostgres} label={health.mcpPostgres === "disconnected" ? "PostgreSQL down" : "PostgreSQL"} />
                  <McpChip status={health.mcpLangfuse} label={health.mcpLangfuse === "disconnected" ? "Langfuse down" : "Langfuse"} />
                  <McpChip status={health.mcpObservability} label={health.mcpObservability === "disconnected" ? "ClickStack down" : "ClickStack (observability)"} />
                </div>
              </div>
            </ArchBlock>
          </div>
        </LayerSection>

        <LayerSection label="LLM Observability — Langfuse" className="flex flex-col">
          <ArchBlock
            {...link(cfg.links.langfuse)}
            icon={LineChart}
            title={names.langfuse}
            subtitle="Are the agents giving good answers? What does it cost?"
            status={health.langfuse}
            className="flex-1"
          >
            <div className="mt-1.5 flex flex-1 flex-col justify-evenly gap-1">
              <FeatureRow label="Prompts" detail="versioning · playground" />
              <FeatureRow label="Tracing" detail="every LLM call logged" />
              <FeatureRow label="Evaluation" detail="LLM-as-judge · human review" />
              <FeatureRow label="Cost tracking" detail="per agent · per conversation" />
            </div>
          </ArchBlock>
        </LayerSection>
      </div>
      <LayerConnector />

      {/* Layer — Data (the heart of the demo) */}
      <section className="rounded-xl border border-dashed border-[--brand]/40 bg-[--brand-dim] px-3 pb-3 pt-2 sm:px-4">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[--brand]">
          Data Layer — ClickHouse Unified Platform
        </p>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <ArchBlock
            {...link(cfg.links.postgresConsole)}
            icon={Database}
            title={names.postgres}
            subtitle="Operational CRUD"
            status={health.postgres}
          >
            <div className="mt-1.5 grid flex-1 grid-cols-2 content-center gap-1 rounded-md border border-[--border] bg-[--surface-hover] p-1.5">
              {["customers", "orders", "order_items", "products", "payment_status_current"].map((t) => (
                <span key={t} className="truncate rounded border border-[--border] bg-[--surface-solid] px-1.5 py-0.5 text-center font-mono text-[9px] text-[--muted-fg]" title={t}>
                  {t}
                </span>
              ))}
              <span className="truncate rounded border border-[--border] bg-[--surface-solid] px-1.5 py-0.5 text-center font-mono text-[9px] font-semibold text-[--muted]">
                +2 more
              </span>
            </div>
          </ArchBlock>

          <ArchBlock
            {...link(cfg.links.clickhouseConsole)}
            icon={Database}
            title={names.clickhouse}
            subtitle="Analytics on billions of rows — medallion architecture, powers every dashboard and agent query"
            status={health.clickhouse}
            large
            className="lg:col-span-2"
          >
            <div className="mt-2 flex flex-1 flex-col items-stretch gap-1 sm:flex-row">
              <MedallionStage
                tone="bronze"
                title="Bronze — raw"
                subtitle="CDC mirrors + event streams"
                tables={["public_orders", "public_customers", "order_events"]}
                more={10}
              />
              <MedallionArrow />
              <MedallionStage
                tone="silver"
                title="Silver — cleaned"
                subtitle="deduplicated via MVs"
                tables={["silver_orders", "silver_customers", "silver_payments", "silver_products"]}
              />
              <MedallionArrow />
              <MedallionStage
                tone="gold"
                title="Gold — aggregates"
                subtitle="pre-computed KPIs via MVs"
                tables={["gold_daily_kpi", "gold_revenue_daily", "gold_customer_rfm"]}
                more={4}
              />
            </div>
          </ArchBlock>
        </div>
      </section>
      <LayerConnector />

      {/* Layer — Ingestion */}
      <LayerSection label="Ingestion">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ArchBlock
            {...link(cfg.links.cdc)}
            icon={Link2}
            title={names.cdc}
            subtitle="Postgres → ClickHouse real-time replication (feeds the bronze layer)"
            status={health.clickpipes}
            detail={health.clickpipesDetail}
          />
          <ArchBlock
            href="/admin/status"
            icon={Radio}
            title="OTel Collector"
            subtitle="Always on — ships logs, traces & metrics to ClickStack"
            status={health.otelCollector}
          />
        </div>
      </LayerSection>

      {/* Conclusion banner */}
      <div className="!mt-2.5 rounded-lg border border-[--brand]/25 bg-[--brand-dim] px-3 py-1.5 text-center">
        <p className="text-[11px] font-medium text-[--fg]">
          <span className="font-semibold text-[--brand]">One platform:</span>{" "}
          analytics · transactions · data movement · observability
        </p>
      </div>
    </div>
  );
}
