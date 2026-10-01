/**
 * Mastra agent for the trace playground.
 *
 * Uses the official @mastra/langfuse exporter so the whole agent run
 * (agent -> llm generations -> tool calls) is exported natively to Langfuse,
 * per https://langfuse.com/integrations/frameworks/mastra
 */
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { LangfuseExporter } from "@mastra/langfuse";
import { Observability } from "@mastra/observability";
import { z } from "zod";
import { queryClickHouse } from "@/lib/clickhouse";
import { aiSdkModel } from "./anthropic";

const revenueTool = createTool({
  id: "clickshop-revenue-metrics",
  description:
    "Fetch live revenue and order metrics from the ClickShop ClickHouse analytics database for the last N hours. Returns revenue, order count and average order value.",
  inputSchema: z.object({
    hours: z.number().min(1).max(168).default(24).describe("Lookback window in hours"),
  }),
  execute: async (inputData: { hours?: number }) => {
    const hours = inputData?.hours ?? 24;
    try {
      const rows = await queryClickHouse<Record<string, unknown>>(
        `SELECT
           round(sum(total_amount), 2) AS revenue,
           count() AS orders,
           round(avg(total_amount), 2) AS avg_order_value
         FROM order_events
         WHERE event_time >= now() - INTERVAL ${Math.floor(hours)} HOUR`,
      );
      return { windowHours: hours, metrics: rows[0] ?? {} };
    } catch (error) {
      return {
        windowHours: hours,
        error: error instanceof Error ? error.message : "query failed",
        metrics: {},
      };
    }
  },
});

const topProductsTool = createTool({
  id: "clickshop-top-products",
  description:
    "Fetch the top selling products by revenue from ClickShop analytics for the last N hours.",
  inputSchema: z.object({
    hours: z.number().min(1).max(168).default(24),
    limit: z.number().min(1).max(10).default(5),
  }),
  execute: async (inputData: { hours?: number; limit?: number }) => {
    const hours = inputData?.hours ?? 24;
    const limit = inputData?.limit ?? 5;
    try {
      const rows = await queryClickHouse<Record<string, unknown>>(
        `SELECT product_id,
                round(sum(total_amount), 2) AS revenue,
                count() AS orders
         FROM order_events
         WHERE event_time >= now() - INTERVAL ${Math.floor(hours)} HOUR
         GROUP BY product_id
         ORDER BY revenue DESC
         LIMIT ${Math.floor(limit)}`,
      );
      return { windowHours: hours, products: rows };
    } catch (error) {
      return {
        windowHours: hours,
        error: error instanceof Error ? error.message : "query failed",
        products: [],
      };
    }
  },
});

const mastraAnalyst = new Agent({
  id: "clickshop-mastra-analyst",
  name: "clickshop-mastra-analyst",
  instructions:
    "You are the ClickShop Mastra Analyst, an AI agent built with the Mastra framework. " +
    "You have tools to query live ClickShop revenue metrics and top products from ClickHouse. " +
    "ALWAYS call at least one tool before answering. Be concise and business-focused: " +
    "lead with the numbers, then one actionable takeaway.",
  model: aiSdkModel() as never,
  tools: { revenueTool, topProductsTool },
});

declare global {
  // eslint-disable-next-line no-var
  var __clickshopMastra: Mastra | undefined;
}

export function getMastra(): Mastra {
  if (globalThis.__clickshopMastra) return globalThis.__clickshopMastra;

  const exporters =
    process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY
      ? [
          new LangfuseExporter({
            publicKey: process.env.LANGFUSE_PUBLIC_KEY,
            secretKey: process.env.LANGFUSE_SECRET_KEY,
            baseUrl: process.env.LANGFUSE_BASE_URL,
            realtime: true,
            environment: process.env.LANGFUSE_TRACING_ENVIRONMENT || process.env.NODE_ENV,
          }),
        ]
      : [];

  globalThis.__clickshopMastra = new Mastra({
    agents: { mastraAnalyst },
    observability: new Observability({
      configs: {
        default: {
          serviceName: "clickshop-mastra",
          exporters,
        },
      },
    }),
  });
  return globalThis.__clickshopMastra;
}

export async function runMastraAnalyst(
  prompt: string,
  traceName: string = "mastra.cost-analyzer",
): Promise<{
  text: string;
  toolCalls: Array<{ name: string; input: unknown }>;
}> {
  const mastra = getMastra();
  const agent = mastra.getAgent("mastraAnalyst");
  // The @mastra/langfuse exporter maps the "traceName" metadata key on the
  // root span to langfuse.trace.name, so the native trace shows up as
  // "mastra.<agent-id>" instead of the internal agent name.
  const result = await agent.generate(prompt, {
    tracingOptions: { metadata: { traceName } },
  });

  const toolCalls: Array<{ name: string; input: unknown }> = [];
  const anyResult = result as unknown as {
    toolCalls?: Array<{ toolName?: string; args?: unknown; input?: unknown }>;
    steps?: Array<{ toolCalls?: Array<{ toolName?: string; args?: unknown; input?: unknown }> }>;
  };
  const collect = (calls?: Array<{ toolName?: string; args?: unknown; input?: unknown }>) => {
    for (const call of calls ?? []) {
      toolCalls.push({ name: call.toolName ?? "tool", input: call.args ?? call.input ?? {} });
    }
  };
  collect(anyResult.toolCalls);
  for (const step of anyResult.steps ?? []) collect(step.toolCalls);

  return { text: result.text ?? "", toolCalls };
}
