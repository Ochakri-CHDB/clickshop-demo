import { NextResponse } from "next/server";
import {
  type LangfuseObservationType,
  recordLangfuseEvent,
  runLangfuseObservation,
} from "@/lib/langfuse-observations";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const OBSERVATION_TYPES: LangfuseObservationType[] = [
  "event",
  "span",
  "generation",
  "agent",
  "tool",
  "chain",
  "retriever",
  "evaluator",
  "embedding",
  "guardrail",
];

export async function POST() {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const runId = `smoke-${Date.now()}`;
  const traceName = "clickshop-langfuse-smoke";
  const executed: Record<string, boolean> = {};

  for (const type of OBSERVATION_TYPES) {
    if (type === "event") {
      await recordLangfuseEvent(
        "langfuse-smoke.event",
        { runId, type },
        traceName,
      );
      executed[type] = true;
      continue;
    }

    await runLangfuseObservation(
      {
        name: `langfuse-smoke.${type}`,
        asType: type,
        traceName,
        metadata: { runId, type },
        input: { ping: true, type },
        model: type === "generation" || type === "embedding" ? "smoke-model-v1" : undefined,
      },
      async (observation) => {
        observation?.update({
          output: { ok: true, type, runId },
          usageDetails:
            type === "generation" || type === "embedding"
              ? { input: 3, output: 2 }
              : undefined,
        });
      },
    );

    executed[type] = true;
  }

  return NextResponse.json({
    ok: true,
    runId,
    traceName,
    executed,
    totalTypes: OBSERVATION_TYPES.length,
  });
}
