/**
 * Level 4 — Tools Agent, built with the Vercel AI SDK (ai + @ai-sdk/anthropic
 * or @ai-sdk/openai-compatible, depending on LLM_PROVIDER).
 *
 * One generateText call drives the whole tool loop (stopWhen: stepCountIs),
 * reusing the shared read-only tools (ClickHouse / Postgres / calculator)
 * through thin jsonSchema adapters. A wrapLanguageModel middleware records
 * each LLM call as a Langfuse GENERATION (with token usage) and each tool
 * execution is traced as a TOOL observation inside the AGENT span.
 */
import {
  generateText,
  jsonSchema,
  stepCountIs,
  tool,
  wrapLanguageModel,
  type ToolSet,
} from "ai";
import { runLangfuseObservation } from "@/lib/langfuse-observations";
import { ANTHROPIC_MODEL, aiSdkModel } from "./anthropic";
import { CLICKHOUSE_SCHEMA_HINT, TOOL_DEFS, executeTool } from "./tools";
import type { DemoStep } from "./index";

type StepCollector = (step: DemoStep) => void;

/** AI SDK middleware: trace every doGenerate call as a Langfuse GENERATION. */
function buildTracedModel(addStep: StepCollector) {
  let turn = 0;
  return wrapLanguageModel({
    model: aiSdkModel() as Parameters<typeof wrapLanguageModel>[0]["model"],
    middleware: {
      wrapGenerate: async ({ doGenerate, params }) => {
        turn += 1;
        const name = `tools-agent.llm-turn-${turn}`;
        return runLangfuseObservation(
          {
            name,
            asType: "generation",
            model: ANTHROPIC_MODEL,
            input: JSON.parse(JSON.stringify(params.prompt ?? [])),
            metadata: { framework: "Vercel AI SDK", middleware: "wrapLanguageModel" },
          },
          async (genObs) => {
            const result = await doGenerate();
            const text = result.content
              .filter((c): c is { type: "text"; text: string } => c.type === "text")
              .map((c) => c.text)
              .join("\n");
            const toolCalls = result.content.filter((c) => c.type === "tool-call").length;
            const usage = {
              input: result.usage.inputTokens.total ?? 0,
              output: result.usage.outputTokens.total ?? 0,
            };
            genObs?.update({
              output: toolCalls ? { text, toolCalls } : text,
              usageDetails: usage,
              metadata: { finishReason: result.finishReason },
            });
            addStep({
              type: "GENERATION",
              name,
              summary: `${usage.input}→${usage.output} tokens${toolCalls ? `, ${toolCalls} tool call(s) requested` : ""}`,
            });
            return result;
          },
        );
      },
    },
  });
}

/** Wrap the shared playground tools as AI SDK tools with TOOL observations. */
function buildAiSdkTools(addStep: StepCollector, toolLogParts: string[]): ToolSet {
  const tools: ToolSet = {};
  for (const def of TOOL_DEFS) {
    tools[def.name] = tool({
      description: def.description,
      inputSchema: jsonSchema<Record<string, unknown>>(def.input_schema as never),
      execute: async (input: Record<string, unknown>) => {
        const started = Date.now();
        return runLangfuseObservation(
          { name: `tool.${def.name}`, asType: "tool", input, metadata: { toolName: def.name } },
          async (toolObs) => {
            try {
              const output = await executeTool(def.name, input);
              toolObs?.update({ output });
              addStep({
                type: "TOOL",
                name: `tool.${def.name}`,
                summary: `${JSON.stringify(input).slice(0, 90)} → ok (${Date.now() - started}ms)`,
              });
              toolLogParts.push(`${def.name}(${JSON.stringify(input)}) => ${JSON.stringify(output).slice(0, 500)}`);
              return output;
            } catch (error) {
              const message = error instanceof Error ? error.message : "tool failed";
              toolObs?.update({ output: { error: message }, level: "ERROR" });
              addStep({
                type: "TOOL",
                name: `tool.${def.name}`,
                summary: `${JSON.stringify(input).slice(0, 90)} → error (${Date.now() - started}ms)`,
              });
              toolLogParts.push(`${def.name}(${JSON.stringify(input)}) => ERROR ${message}`);
              return { error: message };
            }
          },
        );
      },
    });
  }
  return tools;
}

export async function runToolsAgentAiSdk(
  prompt: string,
  addStep: StepCollector,
  domain: string,
): Promise<{ output: string; toolLog: string }> {
  return runLangfuseObservation(
    {
      name: "tools-agent",
      asType: "agent",
      model: ANTHROPIC_MODEL,
      input: [{ role: "user", content: prompt }],
      metadata: { framework: "Vercel AI SDK", tools: TOOL_DEFS.map((t) => t.name) },
    },
    async (agentObs) => {
      const toolLogParts: string[] = [];
      const tools = buildAiSdkTools(addStep, toolLogParts);

      const result = await generateText({
        model: buildTracedModel(addStep),
        system: `${domain} Use the tools to answer with REAL data — never invent numbers. ${CLICKHOUSE_SCHEMA_HINT}\nWhen you have the data, answer concisely with the figures.`,
        prompt,
        tools,
        stopWhen: stepCountIs(6),
        // claude-sonnet-5-5 spends part of the output budget on thinking tokens;
        // 1024 gets truncated before the final answer.
        maxOutputTokens: 4096,
      });

      const output =
        result.text ||
        "The agent reached its step limit before finishing. Partial tool data was collected.";
      agentObs?.update({
        output,
        metadata: {
          steps: result.steps.length,
          totalTokens: result.totalUsage?.totalTokens,
          finishReason: result.finishReason,
        },
      });
      return { output, toolLog: toolLogParts.join("\n") };
    },
  );
}
