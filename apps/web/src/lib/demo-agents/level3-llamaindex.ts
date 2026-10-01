/**
 * Level 3 — RAG, built with LlamaIndex.TS.
 *
 * The 12 ClickShop knowledge docs are indexed in an in-memory
 * VectorStoreIndex (custom hash embedding, no external embedding API), the
 * retriever pulls topK chunks, and the configured LLM (@llamaindex/anthropic or
 * @llamaindex/openai against an OpenAI-compatible endpoint)
 * synthesizes a grounded answer. Trace shape is preserved:
 * EMBEDDING → RETRIEVER → GENERATION → EVALUATOR.
 *
 * IMPORTANT: the exported runRag signature (prompt, addStep, domain, {topK})
 * is used by scripts/langfuse-experiment-rag-chunks.ts. Keep it stable.
 */
import { BaseEmbedding, Document, Settings, VectorStoreIndex } from "llamaindex";
import { Anthropic as LlamaAnthropic } from "@llamaindex/anthropic";
import { OpenAI as LlamaOpenAI } from "@llamaindex/openai";
import { LLM_PROVIDER, OPENAI_API_KEY, OPENAI_BASE_URL } from "@/lib/llm";
import { runLangfuseObservation } from "@/lib/langfuse-observations";
import { queryClickHouse } from "@/lib/clickhouse";
import { ANTHROPIC_MODEL } from "./anthropic";
import { KNOWLEDGE_DOCS, hashEmbed } from "./knowledge";
import type { DemoStep } from "./index";

const EMBED_MODEL_NAME = "clickshop-hash-embed-v1";

class HashEmbedding extends BaseEmbedding {
  constructor() {
    super();
  }

  async getTextEmbedding(text: string): Promise<number[]> {
    return hashEmbed(text);
  }
}

let indexPromise: Promise<VectorStoreIndex> | null = null;

function getKnowledgeIndex(): Promise<VectorStoreIndex> {
  if (!indexPromise) {
    Settings.embedModel = new HashEmbedding();
    const documents = KNOWLEDGE_DOCS.map(
      (doc) =>
        new Document({
          id_: doc.id,
          text: `${doc.title}. ${doc.text}`,
          metadata: { docId: doc.id, title: doc.title },
        }),
    );
    indexPromise = VectorStoreIndex.fromDocuments(documents);
  }
  return indexPromise;
}

let llm: LlamaAnthropic | LlamaOpenAI | null = null;
function getLlm(): LlamaAnthropic | LlamaOpenAI {
  if (!llm) {
    llm =
      LLM_PROVIDER === "anthropic"
        ? new LlamaAnthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
            model: ANTHROPIC_MODEL as never,
            maxTokens: 1024,
          })
        : new LlamaOpenAI({
            apiKey: OPENAI_API_KEY,
            model: ANTHROPIC_MODEL,
            maxTokens: 1024,
            baseURL: OPENAI_BASE_URL,
          });
  }
  return llm;
}

export interface RagRunOptions {
  /** Number of knowledge-base chunks retrieved (default 3). Used by the chunk-size experiment. */
  topK?: number;
}

export interface RagRunOutput {
  output: string;
  context: string;
  usage: { input: number; output: number };
  retrievedDocs: Array<{ id: string; title: string; score: number }>;
}

export async function runRagLlamaIndex(
  prompt: string,
  addStep: (step: DemoStep) => void,
  domain: string,
  options?: RagRunOptions,
): Promise<RagRunOutput> {
  const topK = Math.max(1, Math.min(options?.topK ?? 3, KNOWLEDGE_DOCS.length));
  const index = await getKnowledgeIndex();

  // 1. EMBEDDING — query vector via the LlamaIndex embed model
  await runLangfuseObservation(
    {
      name: "rag.embed-query",
      asType: "embedding",
      model: EMBED_MODEL_NAME,
      input: prompt,
      metadata: { framework: "LlamaIndex.TS" },
    },
    async (obs) => {
      const vec = await Settings.embedModel.getQueryEmbedding({ type: "text", text: prompt });
      obs?.update({
        output: { dims: vec?.length ?? 0 },
        usageDetails: { input: prompt.split(/\s+/).length, output: 0 },
      });
      addStep({ type: "EMBEDDING", name: "rag.embed-query", summary: `${vec?.length ?? 0}-dim vector (LlamaIndex)` });
    },
  );

  // 2. RETRIEVER — VectorStoreIndex retriever + live ClickHouse metric
  const retrieved = await runLangfuseObservation(
    {
      name: "rag.retrieve",
      asType: "retriever",
      input: { query: prompt, topK },
      metadata: { framework: "LlamaIndex.TS", retriever: "VectorIndexRetriever" },
    },
    async (obs) => {
      const retriever = index.asRetriever({ similarityTopK: topK });
      const nodes = await retriever.retrieve({ query: prompt });
      const docs = nodes.map((n) => {
        const meta = (n.node.metadata ?? {}) as { docId?: string; title?: string };
        const source = KNOWLEDGE_DOCS.find((d) => d.id === meta.docId);
        return {
          id: meta.docId ?? n.node.id_,
          title: meta.title ?? "unknown",
          score: Number((n.score ?? 0).toFixed(4)),
          text: source?.text ?? "",
        };
      });

      let liveMetric = "";
      try {
        const rows = await queryClickHouse<Record<string, unknown>>(
          "SELECT round(sum(total_amount),2) AS revenue_24h, count() AS orders_24h FROM order_events WHERE event_time >= now() - INTERVAL 24 HOUR",
        );
        liveMetric = `Live metric (ClickHouse): last 24h revenue=${rows[0]?.revenue_24h ?? "n/a"}, orders=${rows[0]?.orders_24h ?? "n/a"}`;
      } catch {
        liveMetric = "Live metric unavailable (ClickHouse unreachable).";
      }

      obs?.update({
        output: {
          documents: docs.map((d) => ({ id: d.id, title: d.title, score: d.score })),
          liveMetric,
        },
      });
      addStep({
        type: "RETRIEVER",
        name: "rag.retrieve",
        summary: `top${topK}: ${docs.map((d) => `${d.id}(${d.score})`).join(", ")}`,
      });
      return { docs, liveMetric };
    },
  );

  const context = [
    ...retrieved.docs.map((d) => `[${d.title}] ${d.text}`),
    retrieved.liveMetric,
  ].join("\n\n");

  // 3. GENERATION grounded in context (LlamaIndex Anthropic LLM)
  const generation = await runLangfuseObservation(
    {
      name: "rag.generate",
      asType: "generation",
      model: ANTHROPIC_MODEL,
      input: [
        { role: "system", content: `${domain} Answer ONLY using the provided context.`.slice(0, 1500) },
        { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${prompt}`.slice(0, 2000) },
      ],
      metadata: { framework: "LlamaIndex.TS" },
    },
    async (genObs) => {
      const res = await (getLlm() as LlamaAnthropic).chat({
        messages: [
          {
            role: "system",
            content: `${domain} Answer ONLY using the provided context. If the context does not contain the answer, say so. Cite the document titles you used. Under 150 words.`,
          },
          { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION: ${prompt}` },
        ],
      });
      const text =
        typeof res.message.content === "string"
          ? res.message.content
          : res.message.content.map((c) => ("text" in c ? c.text : "")).join("\n");
      const raw = res.raw as
        | { usage?: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number } }
        | undefined;
      const usage = {
        input: raw?.usage?.input_tokens ?? raw?.usage?.prompt_tokens ?? 0,
        output: raw?.usage?.output_tokens ?? raw?.usage?.completion_tokens ?? 0,
      };
      genObs?.update({ output: text, usageDetails: usage });
      addStep({ type: "GENERATION", name: "rag.generate", summary: `${usage.input}→${usage.output} tokens (LlamaIndex)` });
      return { text, usage };
    },
  );

  // 4. Heuristic EVALUATOR (grounding check)
  await runLangfuseObservation(
    { name: "rag.groundedness-check", asType: "evaluator", input: { answerPreview: generation.text.slice(0, 300) } },
    async (obs) => {
      const citesDoc = retrieved.docs.some((d) =>
        generation.text.toLowerCase().includes(d.title.toLowerCase().split(" ")[0]),
      );
      const verdict = citesDoc ? "grounded" : "review";
      obs?.update({ output: { citesKnownDocument: citesDoc, verdict } });
      addStep({ type: "EVALUATOR", name: "rag.groundedness-check", summary: `verdict=${verdict}` });
    },
  );

  return {
    output: generation.text,
    context,
    usage: generation.usage,
    retrievedDocs: retrieved.docs.map((d) => ({ id: d.id, title: d.title, score: d.score })),
  };
}
