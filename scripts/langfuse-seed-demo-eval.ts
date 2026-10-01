import fs from "node:fs";
import path from "node:path";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import { LangfuseClient } from "@langfuse/client";

type DemoCase = {
  id: string;
  persona: "ceo" | "sales" | "data";
  question: string;
  expected: string;
  domain: string;
  difficulty: "easy" | "medium" | "hard";
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

function normalize(input: unknown): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cosineLikeScore(a: string, b: string): number {
  const at = new Set(normalize(a).split(" ").filter(Boolean));
  const bt = new Set(normalize(b).split(" ").filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let common = 0;
  for (const tok of at) if (bt.has(tok)) common++;
  return Number((common / Math.sqrt(at.size * bt.size)).toFixed(4));
}

function keywordCoverageScore(output: string, expected: string): number {
  const expectedTerms = normalize(expected)
    .split(" ")
    .filter((t) => t.length > 4);
  if (expectedTerms.length === 0) return 0.5;
  const outputSet = new Set(normalize(output).split(" ").filter(Boolean));
  const matches = expectedTerms.filter((term) => outputSet.has(term)).length;
  return Number((matches / expectedTerms.length).toFixed(4));
}

function personaAlignmentScore(output: string, persona: string): number {
  const personaHints: Record<string, string[]> = {
    ceo: ["strategy", "growth", "risk", "executive", "revenue"],
    sales: ["pipeline", "account", "deal", "conversion", "churn"],
    data: ["schema", "query", "latency", "pipeline", "quality"],
  };
  const hints = personaHints[persona] ?? [];
  if (hints.length === 0) return 0.7;
  const out = normalize(output);
  const matched = hints.filter((hint) => out.includes(hint)).length;
  return Number((matched / hints.length).toFixed(4));
}

function groundednessScore(output: string): number {
  const positiveSignals = ["segment", "metric", "query", "provider", "funnel", "cohort"];
  const speculativeSignals = ["maybe", "probably", "guess", "unsure", "not sure"];
  const normalized = normalize(output);
  const pos = positiveSignals.filter((w) => normalized.includes(w)).length;
  const neg = speculativeSignals.filter((w) => normalized.includes(w)).length;
  const raw = Math.max(0, Math.min(1, (pos * 0.2 + 0.3) - neg * 0.15));
  return Number(raw.toFixed(4));
}

function actionabilityScore(output: string): number {
  const normalized = normalize(output);
  const actionSignals = [
    "prioritize",
    "investigate",
    "launch",
    "segment",
    "monitor",
    "trigger",
    "define",
    "review",
    "optimize",
  ];
  const matches = actionSignals.filter((signal) => normalized.includes(signal)).length;
  const hasListShape = /\b1\.|\b2\.|\b3\.|- /.test(output);
  const raw = Math.max(0, Math.min(1, matches / 4 + (hasListShape ? 0.15 : 0)));
  return Number(raw.toFixed(4));
}

function buildDemoCases(): DemoCase[] {
  return [
    {
      id: "ceo-growth-1",
      persona: "ceo",
      question: "What should the CEO prioritize if conversion dropped 8% in Germany this week?",
      expected:
        "Investigate checkout funnel friction in Germany, run device-level analysis, and launch a short remediation plan with pricing and payment-method checks.",
      domain: "growth",
      difficulty: "medium",
    },
    {
      id: "ceo-risk-1",
      persona: "ceo",
      question: "How do we respond to a spike in failed payments in France?",
      expected:
        "Escalate payment provider diagnostics, segment failures by provider and card type, and trigger customer recovery workflows immediately.",
      domain: "risk",
      difficulty: "medium",
    },
    {
      id: "sales-pipeline-1",
      persona: "sales",
      question: "Give 3 actions to improve close rates for enterprise accounts in Q2.",
      expected:
        "Prioritize high-intent accounts, tighten multi-threading with decision makers, and use value-based proposals tied to ROI.",
      domain: "pipeline",
      difficulty: "easy",
    },
    {
      id: "sales-churn-1",
      persona: "sales",
      question: "What should a rep do first when churn risk rises in premium customers?",
      expected:
        "Start proactive outreach, review support and usage signals, and define a retention play with personalized offers.",
      domain: "retention",
      difficulty: "easy",
    },
    {
      id: "data-quality-1",
      persona: "data",
      question: "How should the data team react to a sudden null-rate increase in order totals?",
      expected:
        "Validate upstream schema changes, isolate affected ingestion jobs, and patch transformations with backfill steps.",
      domain: "quality",
      difficulty: "hard",
    },
    {
      id: "data-cost-1",
      persona: "data",
      question: "How can we reduce ClickHouse query cost while keeping dashboard latency low?",
      expected:
        "Optimize partition and sort keys, materialize common aggregates, and enforce query guardrails and cost monitoring.",
      domain: "cost",
      difficulty: "hard",
    },
  ];
}

function safeUpdate(
  observation: unknown,
  payload: Record<string, unknown>,
): void {
  const candidate = observation as { update?: (data: Record<string, unknown>) => unknown };
  if (typeof candidate.update === "function") {
    candidate.update(payload);
  }
}

function personaToUser(persona: DemoCase["persona"] | "ops"): string {
  if (persona === "ceo") return "ceo@clickshop.ai";
  if (persona === "sales") return "sales-manager@clickshop.ai";
  if (persona === "ops") return "ops-analyst@clickshop.ai";
  return "data-lead@clickshop.ai";
}

async function main() {
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

  const spanProcessor = new LangfuseSpanProcessor({
    publicKey,
    secretKey,
    baseUrl,
    exportMode: "immediate",
  });
  const sdk = new NodeSDK({
    spanProcessors: [spanProcessor],
  });
  sdk.start();

  const langfuse = new LangfuseClient();

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const datasetName = `clickshop-demo-eval-${now.toISOString().slice(0, 10)}`;
  const runName = `clickshop-demo-experiment-${stamp}`;
  const demoCases = buildDemoCases();

  try {
    try {
      await langfuse.api.datasets.create({
        name: datasetName,
        description:
          "Demo dataset for ClickShop session: strategic Q&A across CEO, Sales, and Data personas.",
        metadata: {
          source: "clickshop-demo-script",
          purpose: "live-demo",
          generatedAt: now.toISOString(),
        },
      });
      console.log(`Created dataset: ${datasetName}`);
    } catch (err) {
      console.log(`Dataset already exists or cannot be re-created: ${datasetName}`);
      if (process.env.DEBUG_LANGFUSE_SEED === "1") console.error(err);
    }

    for (const item of demoCases) {
      await langfuse.api.datasetItems.create({
        datasetName,
        input: {
          question: item.question,
          persona: item.persona,
          domain: item.domain,
          difficulty: item.difficulty,
        },
        expectedOutput: item.expected,
        metadata: {
          caseId: item.id,
          type: "demo-eval",
          domain: item.domain,
        },
      });
    }
    console.log(`Seeded dataset items: ${demoCases.length}`);

    const dataset = await langfuse.dataset.get(datasetName);

    const task = async (item: { input: Record<string, unknown>; expectedOutput?: unknown }) => {
      const input = item.input;
      const question = String(input.question ?? "");
      const persona = String(input.persona ?? "unknown");
      const expected = String(item.expectedOutput ?? "");
      const userId = personaToUser((input.persona as DemoCase["persona"] | "ops") ?? "data");
      const sessionId = `demo-session-${persona}-${new Date().toISOString().slice(0, 10)}`;

      return propagateAttributes(
        {
          userId,
          sessionId,
          traceName: `clickshop-demo-${persona}`,
          metadata: {
            persona,
            runName,
            source: "clickshop-demo-seed",
          },
        },
        async () =>
          startActiveObservation(
            "clickshop.demo.agent",
            async (agentObs) => {

              safeUpdate(agentObs, {
                input,
                metadata: { persona, demo: true, source: "langfuse-seed-script" },
              });

              await startActiveObservation(
                "clickshop.demo.chain",
                async (chainObs) => {
                  safeUpdate(chainObs, {
                    input: { step: "context-assembly", question },
                    output: {
                      contextPieces: 3,
                      dataSources: ["gold_daily_kpi", "sales_pipeline", "quality_alerts"],
                    },
                  });
                },
                { asType: "chain" },
              );

              await startActiveObservation(
                "clickshop.demo.retriever",
                async (retrieverObs) => {
                  safeUpdate(retrieverObs, {
                    input: { query: question, topK: 5 },
                    output: {
                      documents: [
                        { id: "doc-1", score: 0.93 },
                        { id: "doc-2", score: 0.88 },
                        { id: "doc-3", score: 0.81 },
                      ],
                    },
                  });
                },
                { asType: "retriever" },
              );

              await startActiveObservation(
                "clickshop.demo.embedding",
                async (embeddingObs) => {
                  safeUpdate(embeddingObs, {
                    model: "demo-embedding-v1",
                    input: question,
                    usageDetails: { input: question.split(/\s+/).length, output: 0 },
                    output: { dims: 12 },
                  });
                },
                { asType: "embedding" },
              );

              await startActiveObservation(
                "clickshop.demo.guardrail",
                async (guardrailObs) => {
                  const safe = !/jailbreak|exploit|hack/i.test(question);
                  safeUpdate(guardrailObs, {
                    input: { question },
                    output: { safe, policy: "clickshop-default" },
                  });
                },
                { asType: "guardrail" },
              );

              await startActiveObservation(
                "clickshop.demo.tool",
                async (toolObs) => {
                  safeUpdate(toolObs, {
                    input: { tool: "clickhouse.query", sql: "SELECT ... FROM gold_daily_kpi LIMIT 1000" },
                    output: { rows: 1000, latencyMs: 42 },
                  });
                },
                { asType: "tool" },
              );

              const outputText = `${expected} [demo-${persona}]`;

              await startActiveObservation(
                "clickshop.demo.generation",
                async (genObs) => {
                  safeUpdate(genObs, {
                    model: "claude-sonnet-5",
                    input: [{ role: "user", content: question }],
                    output: outputText,
                    usageDetails: { input: 120, output: 65 },
                    metadata: { provider: "anthropic", persona },
                  });
                },
                { asType: "generation" },
              );

              await startActiveObservation(
                "clickshop.demo.evaluator",
                async (evalObs) => {
                  const semantic = cosineLikeScore(outputText, expected);
                  safeUpdate(evalObs, {
                    input: { output: outputText, expected },
                    output: {
                      name: "semantic_overlap",
                      value: semantic,
                      verdict: semantic >= 0.75 ? "pass" : "review",
                    },
                  });
                },
                { asType: "evaluator" },
              );

              await startActiveObservation(
                "clickshop.demo.event",
                async (eventObs) => {
                  safeUpdate(eventObs, {
                    input: { stage: "finalize" },
                    metadata: { persona, runName },
                    output: { status: "ok" },
                  });
                },
                { asType: "event" },
              );

              safeUpdate(agentObs, {
                output: { answer: outputText, persona },
              });

              return outputText;
            },
            { asType: "agent" },
          ),
      );
    };

    const accuracyEvaluator = async ({
      output,
      expectedOutput,
    }: {
      output: unknown;
      expectedOutput: unknown;
    }) => {
      const score = cosineLikeScore(String(output ?? ""), String(expectedOutput ?? ""));
      return {
        name: "business_accuracy",
        value: score,
        comment: `Token overlap similarity = ${(score * 100).toFixed(1)}%`,
      };
    };

    const readabilityEvaluator = async ({ output }: { output: unknown }) => {
      const out = String(output ?? "");
      const len = out.length;
      const score = len >= 80 && len <= 320 ? 1 : 0.6;
      return {
        name: "readability_quality",
        value: score,
        comment: `Output length=${len}`,
      };
    };

    const completenessEvaluator = async ({
      output,
      expectedOutput,
    }: {
      output: unknown;
      expectedOutput: unknown;
    }) => {
      const score = keywordCoverageScore(String(output ?? ""), String(expectedOutput ?? ""));
      return {
        name: "completeness_coverage",
        value: score,
        comment: `Expected-keyword coverage ${(score * 100).toFixed(1)}%`,
      };
    };

    const groundingEvaluator = async ({ output }: { output: unknown }) => {
      const score = groundednessScore(String(output ?? ""));
      return {
        name: "evidence_groundedness",
        value: score,
        comment: `Grounding signal score ${(score * 100).toFixed(1)}%`,
      };
    };

    const actionabilityEvaluator = async ({ output }: { output: unknown }) => {
      const score = actionabilityScore(String(output ?? ""));
      return {
        name: "actionability",
        value: score,
        comment: `Actionability score ${(score * 100).toFixed(1)}%`,
      };
    };

    const safetyEvaluator = async ({ output }: { output: unknown }) => {
      const unsafeSignals = /jailbreak|hack|bypass|exfiltrate|attack|drop table/i.test(
        String(output ?? ""),
      );
      return {
        name: "safety_hallucination",
        value: unsafeSignals ? 0 : 1,
        comment: unsafeSignals
          ? "Unsafe/hallucination signal found in answer."
          : "Safe answer with no risky signal.",
      };
    };

    const alignmentEvaluator = async ({ output }: { output: unknown }) => {
      const out = String(output ?? "");
      const personaMatch = out.match(/\[demo-([a-z]+)\]/i);
      const persona = personaMatch?.[1] ?? "unknown";
      const score = personaAlignmentScore(String(output ?? ""), persona);
      return {
        name: "persona_alignment",
        value: score,
        comment: `Alignment with persona=${persona}`,
      };
    };

    const followupFlagEvaluator = async ({
      output,
      expectedOutput,
    }: {
      output: unknown;
      expectedOutput: unknown;
    }) => {
      const accuracy = cosineLikeScore(String(output ?? ""), String(expectedOutput ?? ""));
      const needsFollowup = accuracy < 0.65;
      return {
        name: "requires_human_followup",
        value: needsFollowup ? 1 : 0,
        comment: needsFollowup
          ? "Low semantic overlap, reviewer follow-up recommended."
          : "No reviewer follow-up required.",
      };
    };

    const runEvaluator = async ({
      itemResults,
    }: {
      itemResults: Array<{ evaluations?: Array<{ name: string; value: number | null }> }>;
    }) => {
      const acc = itemResults
        .flatMap((res) => res.evaluations ?? [])
        .filter((e) => e.name === "business_accuracy" && typeof e.value === "number")
        .map((e) => Number(e.value));
      if (acc.length === 0) return { name: "avg_accuracy", value: null };
      const avg = acc.reduce((sum, val) => sum + val, 0) / acc.length;
      return {
        name: "avg_business_accuracy",
        value: Number(avg.toFixed(4)),
        comment: `Average item accuracy across ${acc.length} cases`,
      };
    };

    const overallRunQualityEvaluator = async ({
      itemResults,
    }: {
      itemResults: Array<{ evaluations?: Array<{ name: string; value: number | null }> }>;
    }) => {
      const metrics = [
        "business_accuracy",
        "actionability",
        "safety_hallucination",
        "readability_quality",
        "completeness_coverage",
        "evidence_groundedness",
        "persona_alignment",
      ];
      const values = itemResults
        .flatMap((res) => res.evaluations ?? [])
        .filter((e) => metrics.includes(e.name) && typeof e.value === "number")
        .map((e) => Number(e.value));
      if (values.length === 0) return { name: "overall_quality_score", value: null };
      const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
      return {
        name: "overall_quality_score",
        value: Number(avg.toFixed(4)),
        comment: `Average across ${metrics.length} evaluation dimensions`,
      };
    };

    const result = await dataset.runExperiment({
      name: runName,
      description:
        "ClickShop demo experiment run with multi-type observations + evaluators for live presentation.",
      task,
      evaluators: [
        accuracyEvaluator,
        actionabilityEvaluator,
        safetyEvaluator,
        readabilityEvaluator,
        completenessEvaluator,
        groundingEvaluator,
        alignmentEvaluator,
        followupFlagEvaluator,
      ],
      runEvaluators: [runEvaluator, overallRunQualityEvaluator],
      maxConcurrency: 2,
    });

    console.log(await result.format());

    const itemResults = (result as unknown as { itemResults?: Array<{ traceId?: string }> })
      .itemResults;
    const traceIds = (itemResults ?? [])
      .map((r) => r.traceId)
      .filter((v): v is string => Boolean(v));

    for (const traceId of traceIds.slice(0, 3)) {
      await langfuse.score.create({
        traceId,
        name: "reviewer_note",
        value: "Strong business framing and actionable recommendation.",
        dataType: "TEXT",
        comment: "Manual reviewer note for demo",
      });
    }

    await langfuse.flush();
    await spanProcessor.forceFlush();

    console.log(
      JSON.stringify(
        {
          ok: true,
          datasetName,
          runName,
          seededItems: demoCases.length,
          tracedItems: traceIds.length,
          addedTextScores: Math.min(traceIds.length, 3),
        },
        null,
        2,
      ),
    );
  } finally {
    await spanProcessor.forceFlush().catch(() => undefined);
    await sdk.shutdown().catch(() => undefined);
  }
}

void main().catch((err) => {
  console.error("[langfuse-seed-demo-eval] failed:", err);
  process.exitCode = 1;
});
