/**
 * Langfuse Trace Playground — 6 demo agents of increasing complexity,
 * each built with a different open-source agent framework:
 *
 * Level 1  simple-chat   @anthropic-ai/sdk or openai SDK    TRACE + GENERATION
 * Level 2  prompt-chain  LangChain.js (LCEL)                CHAIN + GENERATION x2 + EVENT
 * Level 3  rag           LlamaIndex.TS                      EMBEDDING + RETRIEVER + GENERATION + EVALUATOR
 * Level 4  tools-agent   Vercel AI SDK                      AGENT + TOOL loop (ClickHouse / Postgres / calculator)
 * Level 5  mastra        Mastra                             native @mastra/langfuse export
 * Level 6  multi-agent   LangGraph.js (StateGraph)          GUARDRAIL + planner + parallel workers + EVALUATOR
 *
 * The 6 use cases are declined per persona (CEO, Sales, Data, SRE,
 * AI Engineer) in ./registry — same runners, persona-specific framing.
 * The admin sees the 6 generic agents.
 *
 * Every run finishes with an LLM-as-a-Judge evaluation whose scores are
 * pushed to the trace through the Langfuse Scores API.
 */
import { getActiveTraceId } from "@langfuse/tracing";
import { runLangfuseObservation } from "@/lib/langfuse-observations";
import { ANTHROPIC_MODEL } from "./anthropic";
import { judgeAndScore, type JudgeScore } from "./judge";
import { runSimpleChatAnthropicSdk } from "./level1-anthropic-sdk";
import { runPromptChainLangChain } from "./level2-langchain";
import { runRagLlamaIndex, type RagRunOptions, type RagRunOutput } from "./level3-llamaindex";
import { runToolsAgentAiSdk } from "./level4-ai-sdk";
import { runMastraAnalyst } from "./mastra";
import { runMultiAgentLangGraph } from "./level6-langgraph";
import { findAgentMeta } from "./registry";

export {
  DEMO_AGENTS,
  PERSONA_AGENTS,
  getAgentsForPersona,
  findAgentMeta,
} from "./registry";
export type { DemoAgentKind, DemoAgentMeta } from "./registry";

export interface DemoStep {
  type: string;
  name: string;
  summary: string;
}

export interface DemoRunResult {
  agentId: string;
  output: string;
  traceId?: string;
  traceName: string;
  steps: DemoStep[];
  judgeScores: JudgeScore[];
  judgeReasoning: string;
  durationMs: number;
  model: string;
}

type StepCollector = (step: DemoStep) => void;

/* ------------------------------------------------------------------ */
/* RAG entry point (stable signature, used by the chunk experiment)    */
/* ------------------------------------------------------------------ */

export type { RagRunOptions };

export async function runRag(
  prompt: string,
  addStep: StepCollector,
  domain: string,
  options?: RagRunOptions,
): Promise<RagRunOutput> {
  return runRagLlamaIndex(prompt, addStep, domain, options);
}

/* ------------------------------------------------------------------ */
/* Level 5 — Mastra (native @mastra/langfuse export)                   */
/* ------------------------------------------------------------------ */

async function runMastra(prompt: string, addStep: StepCollector, agentId: string): Promise<string> {
  const nativeTraceName = `mastra.${agentId}`;
  return runLangfuseObservation(
    {
      name: "mastra-delegation",
      asType: "agent",
      input: { prompt, framework: "mastra" },
      metadata: {
        framework: "Mastra",
        note: `The Mastra run itself is exported natively by @mastra/langfuse as a separate trace named ${nativeTraceName} (service: clickshop-mastra).`,
      },
    },
    async (obs) => {
      const result = await runMastraAnalyst(prompt, nativeTraceName);
      for (const call of result.toolCalls) {
        addStep({
          type: "TOOL",
          name: `mastra.${call.name}`,
          summary: JSON.stringify(call.input).slice(0, 100),
        });
      }
      addStep({
        type: "AGENT",
        name: nativeTraceName,
        summary: "Native Mastra trace exported to Langfuse (service clickshop-mastra)",
      });
      obs?.update({ output: result.text.slice(0, 1000) });
      return result.text;
    },
  );
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

export async function runDemoAgent(params: {
  agentId: string;
  prompt: string;
  userId?: string;
  sessionId?: string;
}): Promise<DemoRunResult> {
  const { agentId, prompt } = params;
  const meta = findAgentMeta(agentId);
  if (!meta) throw new Error(`Unknown demo agent: ${agentId}`);

  // Trace name format "<framework>.<agent>" for readability in the Langfuse UI.
  const traceName = `${meta.frameworkSlug}.${agentId}`;
  const started = Date.now();
  const steps: DemoStep[] = [];
  const addStep: StepCollector = (step) => steps.push(step);

  return runLangfuseObservation(
    {
      name: `playground.${agentId}`,
      asType: meta.kind === "simple-chat" ? "span" : "agent",
      traceName,
      userId: params.userId ?? "demo@clickshop.io",
      sessionId: params.sessionId ?? `playground-${new Date().toISOString().slice(0, 10)}`,
      input: { prompt, level: meta.level },
      metadata: {
        agentId,
        kind: meta.kind,
        level: meta.level,
        framework: meta.framework,
        traceTypes: meta.traceTypes,
        source: "trace-playground",
      },
    },
    async (rootObs) => {
      const traceId = getActiveTraceId();

      let output = "";
      let judgeContext: string | undefined;
      let skipJudge = false;

      switch (meta.kind) {
        case "simple-chat":
          output = await runSimpleChatAnthropicSdk(prompt, addStep, meta.domain);
          break;
        case "prompt-chain":
          output = await runPromptChainLangChain(prompt, addStep, meta.domain);
          break;
        case "rag": {
          const res = await runRag(prompt, addStep, meta.domain);
          output = res.output;
          judgeContext = res.context;
          break;
        }
        case "tools-agent": {
          const res = await runToolsAgentAiSdk(prompt, addStep, meta.domain);
          output = res.output;
          judgeContext = res.toolLog;
          break;
        }
        case "mastra":
          output = await runMastra(prompt, addStep, agentId);
          break;
        case "multi-agent": {
          const res = await runMultiAgentLangGraph(prompt, addStep, meta.domain);
          output = res.output;
          judgeContext = res.context;
          skipJudge = res.blocked;
          break;
        }
        default:
          throw new Error(`Unhandled agent kind: ${meta.kind}`);
      }

      let judgeScores: JudgeScore[] = [];
      let judgeReasoning = "";
      if (!skipJudge) {
        try {
          const judged = await judgeAndScore({
            traceId,
            question: prompt,
            answer: output,
            context: judgeContext,
            agentId,
          });
          judgeScores = judged.scores;
          judgeReasoning = judged.reasoning;
          addStep({
            type: "EVALUATOR",
            name: `judge.${agentId}`,
            summary: judgeScores
              .map((s) => `${s.name.replace("llm_judge_", "")}=${typeof s.value === "number" ? s.value.toFixed(2) : s.value}`)
              .join(" "),
          });
        } catch {
          judgeReasoning = "Judge unavailable for this run.";
        }
      }

      rootObs?.update({ output: output.slice(0, 2000) });

      return {
        agentId,
        output,
        traceId,
        traceName,
        steps,
        judgeScores,
        judgeReasoning,
        durationMs: Date.now() - started,
        model: ANTHROPIC_MODEL,
      };
    },
  );
}
