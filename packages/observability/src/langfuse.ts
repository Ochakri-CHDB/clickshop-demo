import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";

let sdk: NodeSDK | null = null;
let spanProcessor: LangfuseSpanProcessor | null = null;
let started = false;

function isConfigured(): boolean {
  return !!(
    process.env.LANGFUSE_PUBLIC_KEY &&
    process.env.LANGFUSE_SECRET_KEY &&
    process.env.LANGFUSE_BASE_URL
  );
}

/** Langfuse prompt API / scores use string metadata on propagated spans (≤200 chars per value). */
function toPropagatedMetadata(
  metadata?: Record<string, unknown>,
): Record<string, string> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    out[k] = s.length > 200 ? `${s.slice(0, 197)}...` : s;
  }
  return out;
}

function ensureSdk(): boolean {
  if (!isConfigured()) return false;
  if (started) return true;

  spanProcessor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
    exportMode: "immediate",
  });

  sdk = new NodeSDK({
    spanProcessors: [spanProcessor],
  });
  sdk.start();
  started = true;
  return true;
}

/**
 * Fire-and-forget root observation (replaces legacy `Langfuse.trace()`).
 */
export function traceEvent(
  name: string,
  metadata?: Record<string, unknown>,
  userId?: string,
  sessionId?: string,
): void {
  if (!ensureSdk()) return;
  const meta = toPropagatedMetadata(metadata);
  const traceName = name.slice(0, 200);
  const uid = (userId ?? "system").slice(0, 200);
  const sid = (sessionId ?? `session-${Date.now()}`).slice(0, 200);

  void propagateAttributes(
    {
      traceName,
      userId: uid,
      sessionId: sid,
      metadata: meta,
    },
    async () => {
      await startActiveObservation(name, async (span) => {
        span.update({ metadata: metadata ?? {} });
      });
    },
  ).catch((err) => console.error("[Langfuse] traceEvent", err));
}

export function traceSpan(
  traceName: string,
  spanName: string,
  fn: () => Promise<unknown>,
  metadata?: Record<string, unknown>,
): Promise<unknown> {
  if (!ensureSdk()) return fn();
  const meta = toPropagatedMetadata(metadata);

  return propagateAttributes(
    {
      traceName: traceName.slice(0, 200),
      metadata: meta,
    },
    async () =>
      startActiveObservation(spanName, async (span) => {
        span.update({ metadata: metadata ?? {} });
        return fn();
      }),
  );
}

export async function flushLangfuse(): Promise<void> {
  if (spanProcessor) {
    await spanProcessor.forceFlush();
  }
}

export function getLangfuseSpanProcessor(): LangfuseSpanProcessor | null {
  ensureSdk();
  return spanProcessor;
}

export { isConfigured as isLangfuseConfigured };
