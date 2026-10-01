import fs from "node:fs";
import path from "node:path";
import { LangfuseClient } from "@langfuse/client";

type ClickShopDatasetItem = {
  id: string;
  persona: "ceo" | "sales" | "data" | "ops";
  useCase: string;
  question: string;
  expectedOutput: string;
  metadata: Record<string, unknown>;
};

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function buildItems(): ClickShopDatasetItem[] {
  return [
    {
      id: "ceo-geo-conversion-01",
      persona: "ceo",
      useCase: "executive-insight",
      question: "Revenue is flat but sessions are up 18% in DACH. What should we do this week?",
      expectedOutput:
        "Prioritize conversion diagnosis in DACH: compare funnel steps by device/channel, isolate checkout drop-offs, and run a 7-day pricing + payment-method experiment to recover conversion.",
      metadata: { workspace: "ceo", topic: "conversion", priority: "high" },
    },
    {
      id: "ceo-margin-mix-01",
      persona: "ceo",
      useCase: "executive-insight",
      question: "Topline is growing but margin is shrinking. Give a concrete executive action plan.",
      expectedOutput:
        "Shift mix toward higher-margin categories, cap discounting on low-margin SKUs, and monitor AOV and margin-by-channel daily with guardrails for promo spend.",
      metadata: { workspace: "ceo", topic: "margin", priority: "high" },
    },
    {
      id: "sales-pipeline-health-01",
      persona: "sales",
      useCase: "sales-recommendation",
      question: "Pipeline coverage is 2.1x target in France but close rate dropped to 14%. What should reps change?",
      expectedOutput:
        "Re-qualify stalled deals, enforce next-step discipline in CRM, and prioritize accounts with recent product engagement to raise close probability this sprint.",
      metadata: { workspace: "sales", topic: "pipeline", segment: "enterprise" },
    },
    {
      id: "sales-renewal-risk-01",
      persona: "sales",
      useCase: "sales-recommendation",
      question: "Renewal churn risk rose in premium customers. What are the first 3 actions?",
      expectedOutput:
        "Launch proactive outreach in 24h, create save-offers tied to usage patterns, and escalate top-risk accounts to account managers with weekly retention tracking.",
      metadata: { workspace: "sales", topic: "retention", urgency: "urgent" },
    },
    {
      id: "data-anomaly-null-rate-01",
      persona: "data",
      useCase: "data-quality",
      question: "Null rate on total_amount doubled after deployment. What data team playbook should run?",
      expectedOutput:
        "Check source schema drift, validate ingestion mappings, patch transformation logic, and backfill impacted partitions before reopening downstream dashboards.",
      metadata: { workspace: "data", topic: "quality", severity: "critical" },
    },
    {
      id: "data-cost-optimization-01",
      persona: "data",
      useCase: "query-optimization",
      question: "ClickHouse compute cost is rising 22% month over month. What specific optimizations do we apply?",
      expectedOutput:
        "Tune ORDER BY and partition keys for hot queries, add materialized aggregates for dashboard paths, and enforce query budgets with slow-query review automation.",
      metadata: { workspace: "data", topic: "cost", owner: "platform-team" },
    },
    {
      id: "data-text2sql-01",
      persona: "data",
      useCase: "text2sql",
      question: "Generate SQL for 'revenue by country last 7 days with % change vs previous 7 days'.",
      expectedOutput:
        "A ClickHouse SQL query that aggregates revenue by country for current 7 days and previous 7 days, then computes percentage change with safe division.",
      metadata: { workspace: "data", topic: "sql", db: "clickhouse" },
    },
    {
      id: "ops-contract-extract-01",
      persona: "ops",
      useCase: "contract-ingestion",
      question: "A PDF contract includes customer, products, quantities, and payment terms. What should extraction return?",
      expectedOutput:
        "Return structured JSON with customer profile, order header, line items, payment status/provider, and a one-line commercial summary ready for PostgreSQL insert.",
      metadata: { workspace: "sales", topic: "contract-extract", format: "pdf" },
    },
    {
      id: "ops-fraud-alert-01",
      persona: "ops",
      useCase: "fraud-monitoring",
      question: "What patterns indicate likely fraud in the last 24h of order activity?",
      expectedOutput:
        "Flag repeated high-value orders, unusual velocity per customer, and high cancel/refund concentration; assign risk levels and recommended mitigation actions.",
      metadata: { workspace: "ceo", topic: "fraud", timeframe: "24h" },
    },
    {
      id: "ceo-board-summary-01",
      persona: "ceo",
      useCase: "executive-summary",
      question: "Prepare a 5-point board-ready summary from this week’s ecommerce performance.",
      expectedOutput:
        "Provide 5 concise points covering growth, conversion, risk, margin, and next actions, each grounded in a measurable KPI and operational recommendation.",
      metadata: { workspace: "ceo", topic: "board-report", audience: "board" },
    },
    {
      id: "sales-territory-intel-01",
      persona: "sales",
      useCase: "territory-planning",
      question: "Which territory should get extra headcount next quarter and why?",
      expectedOutput:
        "Recommend territory based on pipeline growth, win-rate trend, expansion opportunity, and onboarding feasibility, with quantified upside.",
      metadata: { workspace: "sales", topic: "territory", planning: "q-next" },
    },
    {
      id: "data-pipeline-health-01",
      persona: "data",
      useCase: "pipeline-monitoring",
      question: "CDC lag is spiking every morning at 09:00. How do we diagnose and fix it?",
      expectedOutput:
        "Correlate lag with source write bursts, connector throughput, and sink merge pressure; then tune batch size/concurrency and add alert thresholds.",
      metadata: { workspace: "data", topic: "cdc", layer: "bronze-silver" },
    },
  ];
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), "apps/web/.env"));
  if (!process.env.LANGFUSE_HOST && process.env.LANGFUSE_BASE_URL) {
    process.env.LANGFUSE_HOST = process.env.LANGFUSE_BASE_URL;
  }

  const datasetName = process.argv[2] || "clickshop-demo-eval-2026-04-16";
  const langfuse = new LangfuseClient();
  const items = buildItems();

  for (const item of items) {
    await langfuse.api.datasetItems.create({
      datasetName,
      input: {
        question: item.question,
        persona: item.persona,
        useCase: item.useCase,
      },
      expectedOutput: item.expectedOutput,
      metadata: {
        ...item.metadata,
        source: "clickshop-demo-enrichment",
      },
    });
  }

  await langfuse.flush();
  console.log(
    JSON.stringify(
      {
        ok: true,
        datasetName,
        upsertedItems: items.length,
      },
      null,
      2,
    ),
  );
}

void main().catch((err) => {
  console.error("[langfuse-enrich-clickshop-dataset] failed:", err);
  process.exitCode = 1;
});
