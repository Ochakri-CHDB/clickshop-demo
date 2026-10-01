/**
 * Level 6 — Multi-Agent Orchestra, built with LangGraph.js.
 *
 * A StateGraph orchestrates: input GUARDRAIL → planner (GENERATION) →
 * parallel workers (data-analyst = createReactAgent with the shared SQL
 * tools, knowledge = RETRIEVER over the ClickShop KB) → synthesizer
 * (GENERATION) → output EVALUATOR. The graph run is traced natively by the
 * Langfuse CallbackHandler; guardrail / retriever / evaluator steps are
 * typed observations.
 */
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool as langchainTool } from "@langchain/core/tools";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { CallbackHandler } from "@langfuse/langchain";
import { z } from "zod";
import { runLangfuseObservation, recordLangfuseEvent } from "@/lib/langfuse-observations";
import { ANTHROPIC_MODEL, langchainChatModel } from "./anthropic";
import { CLICKHOUSE_SCHEMA_HINT, executeTool } from "./tools";
import { scoreKnowledge } from "./knowledge";
import type { DemoStep } from "./index";

type StepCollector = (step: DemoStep) => void;

function getLlm(maxTokens: number) {
  return langchainChatModel(maxTokens);
}

function textOf(msg: AIMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .map((part) => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : ""))
    .join("\n");
}

/** Thin LangChain adapters over the shared read-only playground tools. */
function buildLangChainTools(addStep: StepCollector, toolLogParts: string[]) {
  const sqlSchema = z.object({
    sql: z.string().describe("The SELECT query to execute. Always add LIMIT <= 50."),
    reason: z.string().optional().describe("Why this query is needed (short)."),
  });
  const wrap = (name: string, description: string, schema: z.ZodTypeAny) =>
    langchainTool(
      async (input: Record<string, unknown>) => {
        const started = Date.now();
        try {
          const output = await executeTool(name, input);
          addStep({
            type: "TOOL",
            name: `tool.${name}`,
            summary: `${JSON.stringify(input).slice(0, 90)} → ok (${Date.now() - started}ms)`,
          });
          toolLogParts.push(`${name}(${JSON.stringify(input)}) => ${JSON.stringify(output).slice(0, 500)}`);
          return JSON.stringify(output).slice(0, 4000);
        } catch (error) {
          const message = error instanceof Error ? error.message : "tool failed";
          addStep({
            type: "TOOL",
            name: `tool.${name}`,
            summary: `${JSON.stringify(input).slice(0, 90)} → error (${Date.now() - started}ms)`,
          });
          toolLogParts.push(`${name}(${JSON.stringify(input)}) => ERROR ${message}`);
          return JSON.stringify({ error: message });
        }
      },
      { name, description, schema },
    );

  return [
    wrap(
      "clickhouse_query",
      `Run a read-only SQL query (SELECT/WITH) against the ClickShop ClickHouse analytics database. ${CLICKHOUSE_SCHEMA_HINT}`,
      sqlSchema,
    ),
    wrap(
      "postgres_query",
      "Run a read-only SQL query (SELECT) against the ClickShop PostgreSQL transactional database. Tables: customers, products, orders, order_items, payment_status_current, sales_rep_accounts, vip_customer_flags.",
      sqlSchema,
    ),
    wrap(
      "calculator",
      "Evaluate a basic arithmetic expression (numbers, + - * / % ( ) . and spaces only). Use for growth rates, percentages, projections.",
      z.object({ expression: z.string().describe("Arithmetic expression, e.g. (4520-3980)/3980*100") }),
    ),
  ];
}

const OrchestraState = Annotation.Root({
  prompt: Annotation<string>,
  domain: Annotation<string>,
  blocked: Annotation<boolean>,
  dataTask: Annotation<string>,
  knowledgeQuery: Annotation<string>,
  analystOutput: Annotation<string>,
  knowledgeCtx: Annotation<string>,
  synthesis: Annotation<string>,
});
type OrchestraStateType = typeof OrchestraState.State;

export async function runMultiAgentLangGraph(
  prompt: string,
  addStep: StepCollector,
  domain: string,
): Promise<{ output: string; context: string; blocked: boolean }> {
  const toolLogParts: string[] = [];
  const tools = buildLangChainTools(addStep, toolLogParts);

  const guardrailNode = async (state: OrchestraStateType) =>
    runLangfuseObservation(
      { name: "orchestra.input-guardrail", asType: "guardrail", input: { prompt: state.prompt } },
      async (obs) => {
        const blocked = /ignore (all|previous) instructions|system prompt|jailbreak|drop\s+table|exfiltrate/i.test(
          state.prompt,
        );
        obs?.update({ output: { safe: !blocked, policy: "clickshop-input-v1" } });
        addStep({ type: "GUARDRAIL", name: "orchestra.input-guardrail", summary: blocked ? "BLOCKED" : "passed" });
        return { blocked };
      },
    );

  const plannerNode = async (state: OrchestraStateType, config: RunnableConfig) => {
    const res = (await getLlm(300).invoke(
      [
        {
          role: "system",
          content:
            'You are a supervisor agent. Plan how to answer using two specialists: "data-analyst" (SQL tools on live data) and "knowledge" (internal docs). Reply as JSON: {"dataAnalystTask": "...", "knowledgeQuery": "...", "focus": "..."}',
        },
        { role: "user", content: state.prompt },
      ],
      { ...config, runName: "orchestra.planner" },
    )) as AIMessage;
    const usage = res.usage_metadata;
    addStep({
      type: "GENERATION",
      name: "orchestra.planner",
      summary: usage ? `${usage.input_tokens}→${usage.output_tokens} tokens` : "planned",
    });
    let dataTask = state.prompt;
    let knowledgeQuery = state.prompt;
    try {
      const parsed = JSON.parse(textOf(res).match(/\{[\s\S]*\}/)?.[0] ?? "{}");
      dataTask = String(parsed.dataAnalystTask || state.prompt);
      knowledgeQuery = String(parsed.knowledgeQuery || state.prompt);
    } catch {
      /* defaults */
    }
    return { dataTask, knowledgeQuery };
  };

  const analystAgent = createReactAgent({
    llm: getLlm(1024),
    tools,
    prompt: `${domain} You are the data-analyst worker. Use the tools to answer with REAL data — never invent numbers. When you have the data, answer concisely with the figures.`,
  });

  const dataAnalystNode = async (state: OrchestraStateType, config: RunnableConfig) =>
    runLangfuseObservation(
      {
        name: "orchestra.data-analyst",
        asType: "agent",
        model: ANTHROPIC_MODEL,
        input: [{ role: "user", content: state.dataTask }],
        metadata: { worker: "data-analyst", framework: "LangGraph.js createReactAgent" },
      },
      async (obs) => {
        const result = await analystAgent.invoke(
          { messages: [{ role: "user", content: state.dataTask }] },
          { ...config, runName: "orchestra.data-analyst", recursionLimit: 12 },
        );
        const messages = result.messages ?? [];
        const last = messages[messages.length - 1];
        const analystOutput = last instanceof AIMessage ? textOf(last) : String(last?.content ?? "");
        const llmTurns = messages.filter((m) => m instanceof AIMessage).length;
        const toolTurns = messages.filter((m) => m instanceof ToolMessage).length;
        addStep({
          type: "AGENT",
          name: "orchestra.data-analyst",
          summary: `ReAct worker: ${llmTurns} LLM turn(s), ${toolTurns} tool result(s)`,
        });
        obs?.update({ output: analystOutput.slice(0, 1000) });
        return { analystOutput };
      },
    );

  const knowledgeNode = async (state: OrchestraStateType) =>
    runLangfuseObservation(
      {
        name: "orchestra.knowledge-retriever",
        asType: "retriever",
        input: { query: state.knowledgeQuery, topK: 2 },
      },
      async (obs) => {
        const scored = scoreKnowledge(state.knowledgeQuery).slice(0, 2);
        obs?.update({ output: { documents: scored.map((d) => ({ id: d.id, score: d.score })) } });
        addStep({
          type: "RETRIEVER",
          name: "orchestra.knowledge-retriever",
          summary: scored.map((d) => d.id).join(", "),
        });
        return { knowledgeCtx: scored.map((d) => `[${d.title}] ${d.text}`).join("\n") };
      },
    );

  const synthesizerNode = async (state: OrchestraStateType, config: RunnableConfig) => {
    const res = (await getLlm(1024).invoke(
      [
        {
          role: "system",
          content: `${domain} Combine the data analysis and internal knowledge into ONE executive answer: key numbers first, then risks, then 2-3 recommended actions. Under 200 words.`,
        },
        {
          role: "user",
          content: `QUESTION: ${state.prompt}\n\nDATA ANALYST FINDINGS:\n${state.analystOutput}\n\nTOOL LOG:\n${toolLogParts.join("\n").slice(0, 1500)}\n\nINTERNAL KNOWLEDGE:\n${state.knowledgeCtx}`,
        },
      ],
      { ...config, runName: "orchestra.synthesizer" },
    )) as AIMessage;
    const usage = res.usage_metadata;
    addStep({
      type: "GENERATION",
      name: "orchestra.synthesizer",
      summary: usage ? `${usage.input_tokens}→${usage.output_tokens} tokens` : "synthesized",
    });
    return { synthesis: textOf(res) };
  };

  const evaluatorNode = async (state: OrchestraStateType) =>
    runLangfuseObservation(
      { name: "orchestra.output-evaluator", asType: "evaluator", input: { answerPreview: state.synthesis.slice(0, 300) } },
      async (obs) => {
        const hasNumbers = /\d/.test(state.synthesis);
        const hasActions = /recommend|action|should|priorit/i.test(state.synthesis);
        const verdict = hasNumbers && hasActions ? "pass" : "review";
        obs?.update({ output: { hasNumbers, hasActions, verdict } });
        addStep({ type: "EVALUATOR", name: "orchestra.output-evaluator", summary: `verdict=${verdict}` });
        return {};
      },
    );

  const graph = new StateGraph(OrchestraState)
    .addNode("guardrail", guardrailNode)
    .addNode("planner", plannerNode)
    .addNode("dataAnalyst", dataAnalystNode)
    .addNode("knowledge", knowledgeNode)
    .addNode("synthesizer", synthesizerNode)
    .addNode("evaluator", evaluatorNode)
    .addEdge(START, "guardrail")
    .addConditionalEdges("guardrail", (state) => (state.blocked ? END : "planner"), ["planner", END])
    // Fan-out: both workers run in parallel, then join on the synthesizer.
    .addEdge("planner", "dataAnalyst")
    .addEdge("planner", "knowledge")
    .addEdge("dataAnalyst", "synthesizer")
    .addEdge("knowledge", "synthesizer")
    .addEdge("synthesizer", "evaluator")
    .addEdge("evaluator", END)
    .compile();

  return runLangfuseObservation(
    {
      name: "orchestra.supervisor",
      asType: "agent",
      model: ANTHROPIC_MODEL,
      input: [{ role: "user", content: prompt }],
      metadata: { framework: "LangGraph.js", graph: "guardrail → planner → (dataAnalyst ∥ knowledge) → synthesizer → evaluator" },
    },
    async (supervisorObs) => {
      const handler = new CallbackHandler({ tags: ["trace-playground", "langgraph"] });
      const finalState = await graph.invoke(
        { prompt, domain, blocked: false },
        { callbacks: [handler], runName: "langgraph.orchestra", recursionLimit: 25 },
      );

      if (finalState.blocked) {
        const output = "This request was blocked by the input guardrail (potential prompt injection or unsafe SQL).";
        supervisorObs?.update({ output });
        return { output, context: "", blocked: true };
      }

      await recordLangfuseEvent("orchestra.completed", { promptPreview: prompt.slice(0, 120) });
      addStep({ type: "EVENT", name: "orchestra.completed", summary: "graph run finalized" });

      supervisorObs?.update({ output: finalState.synthesis });
      return {
        output: finalState.synthesis,
        context: `${toolLogParts.join("\n")}\n${finalState.knowledgeCtx ?? ""}`.slice(0, 4000),
        blocked: false,
      };
    },
  );
}
