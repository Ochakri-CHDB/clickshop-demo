import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";

export type LangfuseObservationType =
  | "event"
  | "span"
  | "generation"
  | "agent"
  | "tool"
  | "chain"
  | "retriever"
  | "evaluator"
  | "embedding"
  | "guardrail";

export interface LangfuseObservationHandle {
  update: (payload: Record<string, unknown>) => unknown;
}

interface RunObservationOptions {
  name: string;
  asType?: LangfuseObservationType;
  traceName?: string;
  userId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
  input?: unknown;
  output?: unknown;
  model?: string;
}

function isLangfuseEnabled(): boolean {
  return Boolean(
    process.env.LANGFUSE_PUBLIC_KEY &&
      process.env.LANGFUSE_SECRET_KEY &&
      process.env.LANGFUSE_BASE_URL,
  );
}

function toPropagatedMetadata(
  metadata?: Record<string, unknown>,
): Record<string, string> | undefined {
  if (!metadata) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(metadata)) {
    const text = typeof v === "string" ? v : JSON.stringify(v);
    out[k] = text.length > 200 ? `${text.slice(0, 197)}...` : text;
  }
  return out;
}

function initialUpdatePayload(options: RunObservationOptions): Record<string, unknown> {
  const update: Record<string, unknown> = {};
  if (options.input !== undefined) update.input = options.input;
  if (options.output !== undefined) update.output = options.output;
  if (options.model) update.model = options.model;
  if (options.metadata) update.metadata = options.metadata;
  return update;
}

function toObservationHandle(observation: unknown): LangfuseObservationHandle {
  return {
    update: (payload: Record<string, unknown>) => {
      const candidate = observation as { update?: (input: Record<string, unknown>) => unknown };
      if (typeof candidate?.update === "function") {
        return candidate.update(payload);
      }
      return undefined;
    },
  };
}

export async function runLangfuseObservation<T>(
  options: RunObservationOptions,
  fn: (observation?: LangfuseObservationHandle) => Promise<T>,
): Promise<T> {
  if (!isLangfuseEnabled()) return fn();

  const propagatedMetadata = toPropagatedMetadata(options.metadata);
  // Only propagate traceName when explicitly provided — otherwise nested
  // observations would keep overriding the root trace name.
  const propagation: {
    traceName?: string;
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, string>;
  } = {
    userId: options.userId?.slice(0, 200),
    sessionId: options.sessionId?.slice(0, 200),
    metadata: propagatedMetadata,
  };
  if (options.traceName) {
    propagation.traceName = options.traceName.slice(0, 200);
  }

  const startActiveObservationUnsafe = startActiveObservation as unknown as <R>(
    name: string,
    callback: (observation: unknown) => Promise<R>,
    config?: { asType?: LangfuseObservationType },
  ) => Promise<R>;

  return propagateAttributes(propagation, async () =>
    startActiveObservationUnsafe(
      options.name,
      async (observation) => {
        const handle = toObservationHandle(observation);
        const payload = initialUpdatePayload(options);
        if (Object.keys(payload).length > 0) {
          handle.update(payload);
        }
        return fn(handle);
      },
      { asType: options.asType ?? "span" },
    ),
  ) as Promise<T>;
}

export async function recordLangfuseEvent(
  name: string,
  metadata?: Record<string, unknown>,
  traceName?: string,
): Promise<void> {
  await runLangfuseObservation(
    {
      name,
      asType: "event",
      traceName,
      metadata,
      input: metadata,
    },
    async () => undefined,
  );
}
