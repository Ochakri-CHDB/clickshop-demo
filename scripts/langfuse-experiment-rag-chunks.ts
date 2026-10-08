/**
 * Langfuse Experiments demo: RAG chunk-count (top-k) optimization.
 *
 * Sweeps the number of retrieved knowledge-base chunks (k in [1, 2, 4, 6, 8])
 * through the real ClickShop RAG pipeline (apps/web data-quality agent) and
 * creates one Langfuse dataset run per k on the "rag-chunk-optimization"
 * dataset. Each item is scored by an LLM judge (answer_correctness,
 * groundedness) plus efficiency metrics (total_tokens, latency_ms).
 *
 * Run (from the repo root — the tsconfig flag resolves the "@/" imports of
 * the web app):
 *
 *   npx tsx --tsconfig apps/web/tsconfig.json scripts/langfuse-experiment-rag-chunks.ts
 *
 * Options:
 *   --dataset <name>   Run a single experiment on an existing Langfuse
 *                      dataset (items must have input.question) instead of
 *                      the k-sweep. Example: clickshop-demo-eval-2026-07-07
 *   --k <n>            top-k used with --dataset (default 4)
 *
 * Compare the runs in the Langfuse UI: Datasets > rag-chunk-optimization > Runs.
 */
import fs from "node:fs";
import path from "node:path";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseClient } from "@langfuse/client";
import type { Evaluation, Evaluator, RunEvaluator } from "@langfuse/client";

const K_VALUES = [1, 2, 4, 6, 8];
const SWEEP_DATASET = "rag-chunk-optimization";

type RagCase = { id: string; question: string; expected: string; topic: string };

/** 12 questions answerable from the ClickShop knowledge base (KNOWLEDGE_DOCS). */
function buildRagCases(): RagCase[] {
  return [
    {
      id: "dq-fraud-signals",
      topic: "fraud",
      question: "What signals does ClickShop use to detect payment fraud, and where do the alerts come from?",
      expected:
        "Four signals: velocity abuse (more than 5 orders per customer per hour), card testing (many small failed payments then a large one), amount outliers (above the 99th percentile per category), and geo mismatch (IP country vs card issuing country). Alerts stream from payment_events in ClickHouse into the fraud dashboard.",
    },
    {
      id: "dq-funnel-dropoff",
      topic: "funnel",
      question: "What are the stages of the ClickShop checkout funnel and where is the biggest drop-off?",
      expected:
        "Five stages tracked in ClickHouse: page_events (browse), cart_events (add to cart), checkout_events (start checkout), payment_events (payment attempt), order_events (completed order). The biggest drop-off (about 35%) is between checkout start and payment attempt, often driven by shipping costs shown late.",
    },
    {
      id: "dq-payment-failures",
      topic: "payments",
      question: "What payment failure rate is normal, and what should we do when one provider spikes above 10%?",
      expected:
        "A normal failure rate is 4-6%. A spike above 10% for one provider usually indicates a provider incident: check payment_events grouped by provider and error_code, then enable rerouting to the other provider.",
    },
    {
      id: "dq-category-revenue",
      topic: "catalog",
      question: "Which product category drives the most revenue and where does catalog vs analytics data live?",
      expected:
        "Electronics drives roughly 40% of revenue with the highest average order value. The catalog lives in PostgreSQL (products table) while sales analytics live in ClickHouse (order_events, product_performance_hourly).",
    },
    {
      id: "dq-vip-program",
      topic: "vip",
      question: "How important are VIP customers to ClickShop and how is their churn risk monitored?",
      expected:
        "VIPs are flagged in vip_customer_flags (PostgreSQL), represent about 8% of customers but 30% of revenue, and get priority support plus free shipping. Churn risk is monitored via declining order frequency in customer_activity.",
    },
    {
      id: "dq-observability",
      topic: "observability",
      question: "How are ClickShop's AI features observed and evaluated?",
      expected:
        "Every AI feature is traced with Langfuse (agent, tool, retriever, generation, guardrail and evaluator observations). LLM-as-a-judge scores (helpfulness, groundedness, safety) are attached via the Scores API, and daily dataset experiments run against a demo eval set.",
    },
    {
      id: "dq-freshness-sla",
      topic: "freshness",
      question: "What is the data freshness SLA for ClickShop events and when does the on-call get paged?",
      expected:
        "Events land in ClickHouse within 2 minutes via streaming ingest and gold aggregates refresh every 15 minutes. Freshness is monitored with max(event_time) lag alerts; a lag above 10 minutes on order_events pages the data on-call.",
    },
    {
      id: "dq-duplicates",
      topic: "duplicates",
      question: "How does ClickShop handle duplicate order events and what must dashboards do to avoid double counting?",
      expected:
        "order_events is deduplicated by event_id with a ReplacingMergeTree engine, accepting late or retried events within a 24-hour window. Dashboards must read with FINAL or argMax to avoid counting duplicates before background merges complete.",
    },
    {
      id: "dq-null-policy",
      topic: "nulls",
      question: "What is the NULL-rate policy for order totals and what is the standard fix when it is breached?",
      expected:
        "total_amount on order_events must never be NULL; a null rate above 0.5% triggers a data-quality alert. The usual root cause is upstream schema drift in the checkout service, fixed by patching the ingestion mapping and backfilling affected partitions.",
    },
    {
      id: "dq-returns",
      topic: "returns",
      question: "How do refunds show up in the data and which category has the highest return rate?",
      expected:
        "Refunds appear in payment_events with status 'refunded'. The average return rate is 6% overall and highest in fashion at 11%. Refunds are reconciled nightly against the PostgreSQL orders table; unreconciled refunds older than 48 hours raise a finance alert.",
    },
    {
      id: "dq-retention-gdpr",
      topic: "gdpr",
      question: "How long are raw events retained and how are GDPR deletion requests propagated?",
      expected:
        "Raw events are kept 18 months in ClickHouse via TTL clauses and customer PII is pseudonymized in analytics tables. GDPR deletion requests originate in PostgreSQL and propagate to ClickHouse within 72 hours through lightweight deletes.",
    },
    {
      id: "dq-inventory-sync",
      topic: "inventory",
      question: "How does inventory sync between PostgreSQL and ClickHouse, and when does the oversell alert fire?",
      expected:
        "Stock levels sync from PostgreSQL to ClickHouse every 5 minutes through CDC. An oversell alert fires when reserved quantity exceeds available stock. Electronics has the tightest stock buffers because of its high average order value.",
    },
  ];
}

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
    if (key && !process.env[key]) process.env[key] = value;
  }
}

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

interface TaskOutput {
  answer: string;
  k: number;
  totalTokens: number;
  latencyMs: number;
  retrievedDocs: Array<{ id: string; title: string; score: number }>;
  context: string;
}

interface RunSummary {
  runName: string;
  k: number;
  datasetRunId?: string;
  items: number;
  avgCorrectness: number;
  avgGroundedness: number;
  avgTokens: number;
  avgLatencyMs: number;
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

async function main() {
  loadEnvFile(path.resolve(process.cwd(), ".env"));
  loadEnvFile(path.resolve(process.cwd(), "apps/web/.env"));
  if (!process.env.LANGFUSE_HOST && process.env.LANGFUSE_BASE_URL) {
    process.env.LANGFUSE_HOST = process.env.LANGFUSE_BASE_URL;
  }

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST;
  if (!publicKey || !secretKey || !baseUrl) {
    throw new Error("Missing Langfuse env vars (LANGFUSE_PUBLIC_KEY/SECRET_KEY/BASE_URL).");
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY.");
  }

  // Dynamic imports so env vars are loaded before module-load-time reads
  // (anthropic.ts captures ANTHROPIC_API_KEY at import time).
  const { runRag, DEMO_AGENTS } = await import("../apps/web/src/lib/demo-agents");
  const { callClaude } = await import("../apps/web/src/lib/demo-agents/anthropic");
  const ragDomain = DEMO_AGENTS.find((a) => a.kind === "rag")?.domain ?? "";

  const spanProcessor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl,
    exportMode: "immediate",
  });
  const sdk = new NodeSDK({ spanProcessors: [spanProcessor] });
  sdk.start();

  const langfuse = new LangfuseClient();

  const externalDataset = getArg("--dataset");
  const singleK = Number(getArg("--k") ?? 4);
  const datasetName = externalDataset ?? SWEEP_DATASET;

  /* ------------------------------------------------------------------ */
  /* Dataset seeding (sweep dataset only, idempotent)                    */
  /* ------------------------------------------------------------------ */
  if (!externalDataset) {
    const cases = buildRagCases();
    let needsSeed = true;
    try {
      const existing = await langfuse.api.datasets.get(datasetName);
      const items = await langfuse.api.datasetItems.list({ datasetName, limit: 1 });
      needsSeed = (items.data?.length ?? 0) === 0;
      if (!needsSeed) console.log(`Dataset ${existing.name} already seeded, skipping item creation.`);
    } catch {
      await langfuse.api.datasets.create({
        name: datasetName,
        description:
          "RAG top-k optimization dataset: data-quality questions for the ClickShop data-quality agent (level 3, RAG). One run per k in [1,2,4,6,8] compares retrieval depth.",
        metadata: { source: "langfuse-experiment-rag-chunks", agent: "data-quality", kSweep: K_VALUES },
      });
      console.log(`Created dataset: ${datasetName}`);
    }
    if (needsSeed) {
      for (const c of cases) {
        await langfuse.api.datasetItems.create({
          datasetName,
          input: { question: c.question, topic: c.topic },
          expectedOutput: c.expected,
          metadata: { caseId: c.id, agent: "data-quality" },
        });
      }
      console.log(`Seeded ${cases.length} dataset items.`);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Task + evaluators                                                   */
  /* ------------------------------------------------------------------ */
  const makeTask =
    (k: number) =>
    async (item: { input: unknown }): Promise<TaskOutput> => {
      const input = item.input as Record<string, unknown>;
      const question = String(input?.question ?? input ?? "");
      const started = Date.now();
      const res = await runRag(question, () => undefined, ragDomain, { topK: k });
      return {
        answer: res.output,
        k,
        totalTokens: res.usage.input + res.usage.output,
        latencyMs: Date.now() - started,
        retrievedDocs: res.retrievedDocs,
        context: res.context.slice(0, 2500),
      };
    };

  const JUDGE_SYSTEM = `You are a strict evaluation judge for the ClickShop data-quality RAG agent.
Compare the ANSWER with the EXPECTED answer and the retrieved CONTEXT. Respond with ONLY a JSON object, no markdown:
{
  "answer_correctness": <0.0-1.0, does the answer contain the key facts of the expected answer (numbers, table names, thresholds)?>,
  "groundedness": <0.0-1.0, is every claim in the answer supported by the context (1.0) or invented (0.0)?>,
  "reasoning": "<2 short sentences>"
}`;

  const llmJudgeEvaluator: Evaluator = async ({ input, output, expectedOutput }) => {
    const out = output as TaskOutput;
    const question = String((input as Record<string, unknown>)?.question ?? "");
    const userContent = [
      `QUESTION:\n${question}`,
      `CONTEXT (retrieved chunks):\n${out.context.slice(0, 2500)}`,
      `EXPECTED:\n${String(expectedOutput ?? "").slice(0, 1500)}`,
      `ANSWER:\n${out.answer.slice(0, 2500)}`,
    ].join("\n\n");

    let correctness = 0.5;
    let groundedness = 0.5;
    let reasoning = "Judge output could not be parsed.";
    try {
      // No temperature param: deprecated on claude-sonnet-5.
      const res = await callClaude({
        system: JUDGE_SYSTEM,
        messages: [{ role: "user", content: userContent }],
        maxTokens: 300,
      });
      const parsed = JSON.parse(res.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      const clamp = (v: unknown) => Math.max(0, Math.min(1, Number(v)));
      if (Number.isFinite(Number(parsed.answer_correctness))) correctness = clamp(parsed.answer_correctness);
      if (Number.isFinite(Number(parsed.groundedness))) groundedness = clamp(parsed.groundedness);
      reasoning = String(parsed.reasoning ?? reasoning);
    } catch (err) {
      reasoning = `Judge call failed: ${err instanceof Error ? err.message : "unknown"}`;
    }

    return [
      { name: "answer_correctness", value: Number(correctness.toFixed(4)), comment: reasoning },
      { name: "groundedness", value: Number(groundedness.toFixed(4)), comment: reasoning },
    ];
  };

  const efficiencyEvaluator: Evaluator = async ({ output }) => {
    const out = output as TaskOutput;
    return [
      {
        name: "total_tokens",
        value: out.totalTokens,
        comment: `RAG generation tokens (input+output) at k=${out.k}`,
      },
      {
        name: "latency_ms",
        value: out.latencyMs,
        comment: `End-to-end RAG pipeline latency at k=${out.k}`,
      },
    ];
  };

  const makeRunEvaluators = (): RunEvaluator[] => [
    async ({ itemResults }) => {
      const pick = (name: string) =>
        itemResults
          .flatMap((r) => r.evaluations ?? [])
          .filter((e) => e.name === name && typeof e.value === "number")
          .map((e) => Number(e.value));
      const evaluations: Evaluation[] = [
        { name: "avg_answer_correctness", value: Number(avg(pick("answer_correctness")).toFixed(4)) },
        { name: "avg_groundedness", value: Number(avg(pick("groundedness")).toFixed(4)) },
        { name: "avg_total_tokens", value: Number(avg(pick("total_tokens")).toFixed(1)) },
        { name: "avg_latency_ms", value: Number(avg(pick("latency_ms")).toFixed(0)) },
      ];
      return evaluations;
    },
  ];

  /* ------------------------------------------------------------------ */
  /* Experiments                                                         */
  /* ------------------------------------------------------------------ */
  const dataset = await langfuse.dataset.get(datasetName);
  const kValues = externalDataset ? [singleK] : K_VALUES;
  const summaries: RunSummary[] = [];

  for (const k of kValues) {
    const runName = externalDataset
      ? `rag-k${k}-${new Date().toISOString().slice(0, 10)}`
      : `k=${k}-chunks`;
    console.log(`\n=== Running experiment ${runName} on ${datasetName} ===`);

    const result = await dataset.runExperiment({
      name: externalDataset ? `rag-baseline-${datasetName}` : "rag-chunk-optimization",
      runName,
      description: `ClickShop data-quality RAG pipeline (EMBEDDING > RETRIEVER > GENERATION) with topK=${k} retrieved chunks, judged by ${process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5"}.`,
      task: makeTask(k),
      evaluators: [llmJudgeEvaluator, efficiencyEvaluator],
      runEvaluators: makeRunEvaluators(),
      metadata: { topK: k, agent: "data-quality", experiment: "rag-chunk-optimization" },
      maxConcurrency: 3,
    });

    console.log(await result.format());

    const itemResults = (result as unknown as {
      itemResults?: Array<{ evaluations?: Evaluation[]; datasetRunId?: string }>;
      datasetRunId?: string;
    }).itemResults ?? [];
    const datasetRunId =
      (result as unknown as { datasetRunId?: string }).datasetRunId ??
      itemResults.find((r) => r.datasetRunId)?.datasetRunId;

    const pick = (name: string) =>
      itemResults
        .flatMap((r) => r.evaluations ?? [])
        .filter((e) => e.name === name && typeof e.value === "number")
        .map((e) => Number(e.value));

    summaries.push({
      runName,
      k,
      datasetRunId,
      items: itemResults.length,
      avgCorrectness: Number(avg(pick("answer_correctness")).toFixed(4)),
      avgGroundedness: Number(avg(pick("groundedness")).toFixed(4)),
      avgTokens: Number(avg(pick("total_tokens")).toFixed(1)),
      avgLatencyMs: Number(avg(pick("latency_ms")).toFixed(0)),
    });
  }

  /* ------------------------------------------------------------------ */
  /* Winner analysis (sweep mode only)                                   */
  /* ------------------------------------------------------------------ */
  if (!externalDataset && summaries.length > 1) {
    const ranked = [...summaries].sort((a, b) => {
      const qa = (a.avgCorrectness + a.avgGroundedness) / 2;
      const qb = (b.avgCorrectness + b.avgGroundedness) / 2;
      if (Math.abs(qa - qb) > 0.02) return qb - qa; // quality first
      return a.avgTokens - b.avgTokens; // then cheaper wins
    });
    const winner = ranked[0];
    const conclusion =
      `Optimal k=${winner.k}: avg correctness ${winner.avgCorrectness}, groundedness ${winner.avgGroundedness}, ` +
      `~${winner.avgTokens} tokens and ${winner.avgLatencyMs}ms per item. ` +
      `Sweep: ${summaries
        .map((s) => `k=${s.k} (corr ${s.avgCorrectness}, grnd ${s.avgGroundedness}, ${s.avgTokens} tok, ${s.avgLatencyMs}ms)`)
        .join("; ")}.`;

    if (winner.datasetRunId) {
      await langfuse.score.create({
        datasetRunId: winner.datasetRunId,
        name: "optimal_k_winner",
        value: winner.k,
        dataType: "NUMERIC",
        comment: conclusion,
      });
      console.log(`\nAttached winner score to run ${winner.runName} (${winner.datasetRunId}).`);
    }
    console.log(`\nCONCLUSION: ${conclusion}`);
  }

  await langfuse.flush();
  await spanProcessor.forceFlush();

  console.log(JSON.stringify({ ok: true, datasetName, runs: summaries }, null, 2));

  await sdk.shutdown().catch(() => undefined);
}

void main().catch((err) => {
  console.error("[langfuse-experiment-rag-chunks] failed:", err);
  process.exitCode = 1;
});
