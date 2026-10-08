/**
 * Single LLM provider layer for the whole app.
 *
 *   LLM_PROVIDER=anthropic           Anthropic Messages API (ANTHROPIC_API_KEY)
 *   LLM_PROVIDER=openai-compatible   Any /v1/chat/completions server
 *                                    (Ollama, vLLM, LM Studio, OpenAI...)
 *
 * When LLM_PROVIDER is unset, Anthropic is used if ANTHROPIC_API_KEY is
 * present, otherwise the OpenAI-compatible endpoint (Ollama by default).
 *
 * Every framework used by the demo agents (Anthropic/OpenAI SDK, LangChain,
 * LlamaIndex, Vercel AI SDK, Mastra, LangGraph) gets its model from here.
 */

export type LlmProvider = "anthropic" | "openai-compatible";

function resolveProvider(): LlmProvider {
  const explicit = (process.env.LLM_PROVIDER || "").trim().toLowerCase();
  if (explicit === "anthropic") return "anthropic";
  if (explicit === "openai-compatible" || explicit === "openai" || explicit === "ollama") return "openai-compatible";
  return process.env.ANTHROPIC_API_KEY ? "anthropic" : "openai-compatible";
}

export const LLM_PROVIDER: LlmProvider = resolveProvider();

export const LLM_MODEL: string =
  process.env.LLM_MODEL ||
  (LLM_PROVIDER === "anthropic"
    ? process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5"
    : process.env.OPENAI_MODEL || "qwen2.5:7b");

export const OPENAI_BASE_URL: string = (process.env.OPENAI_BASE_URL || "http://ollama:11434/v1").replace(/\/$/, "");
export const OPENAI_API_KEY: string = process.env.LLM_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "ollama";
export const ANTHROPIC_BASE_URL: string = (process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com").replace(/\/$/, "");

/** Human-readable label, e.g. "anthropic/claude-sonnet-5-5" or "openai-compatible/qwen2.5:7b". */
export const LLM_LABEL = `${LLM_PROVIDER}/${LLM_MODEL}`;

/** Small local models need more output budget headroom and tighter prompts. */
export const IS_SMALL_MODEL = LLM_PROVIDER === "openai-compatible";

export interface LlmToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

export interface LlmCallResult {
  text: string;
  toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  stopReason: string;
  usage: { input: number; output: number };
  rawContent: Array<Record<string, unknown>>;
}

export interface LlmCallParams {
  system?: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  maxTokens?: number;
  temperature?: number;
}

async function callAnthropic(params: LlmCallParams): Promise<LlmCallResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const body: Record<string, unknown> = {
    model: LLM_MODEL,
    max_tokens: params.maxTokens ?? 1024,
    messages: params.messages,
  };
  if (params.system) body.system = params.system;
  if (params.tools && params.tools.length > 0) body.tools = params.tools;
  if (params.temperature !== undefined) body.temperature = params.temperature;

  const res = await fetch(`${ANTHROPIC_BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${err.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    content?: Array<Record<string, unknown>>;
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const content = data.content ?? [];
  return {
    text: content.filter((c) => c.type === "text").map((c) => String(c.text ?? "")).join("\n"),
    toolUses: content
      .filter((c) => c.type === "tool_use")
      .map((c) => ({ id: String(c.id ?? ""), name: String(c.name ?? ""), input: (c.input ?? {}) as Record<string, unknown> })),
    stopReason: String(data.stop_reason ?? "end_turn"),
    usage: { input: data.usage?.input_tokens ?? 0, output: data.usage?.output_tokens ?? 0 },
    rawContent: content,
  };
}

/** Anthropic-style content blocks to an OpenAI chat message list. */
function toOpenAiMessages(params: LlmCallParams): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  if (params.system) out.push({ role: "system", content: params.system });
  for (const m of params.messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const texts: string[] = [];
    const toolCalls: Array<Record<string, unknown>> = [];
    for (const block of m.content) {
      if (block.type === "text") texts.push(String(block.text ?? ""));
      else if (block.type === "tool_use") {
        toolCalls.push({
          id: String(block.id ?? ""),
          type: "function",
          function: { name: String(block.name ?? ""), arguments: JSON.stringify(block.input ?? {}) },
        });
      } else if (block.type === "tool_result") {
        const c = block.content;
        out.push({
          role: "tool",
          tool_call_id: String(block.tool_use_id ?? ""),
          content: typeof c === "string" ? c : JSON.stringify(c ?? ""),
        });
      }
    }
    if (m.role === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant", content: texts.join("\n") };
      if (toolCalls.length) msg.tool_calls = toolCalls;
      out.push(msg);
    } else if (texts.length) {
      out.push({ role: "user", content: texts.join("\n") });
    }
  }
  return out;
}

async function callOpenAiCompatible(params: LlmCallParams): Promise<LlmCallResult> {
  const body: Record<string, unknown> = {
    model: LLM_MODEL,
    max_tokens: params.maxTokens ?? 1024,
    messages: toOpenAiMessages(params),
    stream: false,
  };
  if (params.temperature !== undefined) body.temperature = params.temperature;
  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
  }
  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM API error (${res.status}): ${err.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
      };
      finish_reason?: string;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? "";
  const toolUses = (choice?.message?.tool_calls ?? []).map((tc, i) => {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(tc.function?.arguments || "{}");
    } catch {
      input = {};
    }
    return { id: tc.id || `call_${i}`, name: tc.function?.name || "", input };
  });
  const rawContent: Array<Record<string, unknown>> = [];
  if (text) rawContent.push({ type: "text", text });
  for (const t of toolUses) rawContent.push({ type: "tool_use", id: t.id, name: t.name, input: t.input });
  return {
    text,
    toolUses,
    stopReason: toolUses.length ? "tool_use" : choice?.finish_reason === "length" ? "max_tokens" : "end_turn",
    usage: { input: data.usage?.prompt_tokens ?? 0, output: data.usage?.completion_tokens ?? 0 },
    rawContent,
  };
}

/** Provider-agnostic chat call with Anthropic-shaped inputs/outputs. */
export async function callLLM(params: LlmCallParams): Promise<LlmCallResult> {
  return LLM_PROVIDER === "anthropic" ? callAnthropic(params) : callOpenAiCompatible(params);
}

/** URL of the provider, for trace metadata. */
export function llmEndpoint(): string {
  return LLM_PROVIDER === "anthropic" ? `${ANTHROPIC_BASE_URL}/v1/messages` : `${OPENAI_BASE_URL}/chat/completions`;
}
