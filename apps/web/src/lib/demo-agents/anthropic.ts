/**
 * Framework-specific model factories for the demo agents. Every factory
 * honours LLM_PROVIDER (see @/lib/llm), so the same six agents run on
 * Anthropic Claude or on any OpenAI-compatible server (Ollama by default).
 */
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import {
  ANTHROPIC_BASE_URL,
  LLM_MODEL,
  LLM_PROVIDER,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  callLLM,
} from "@/lib/llm";

export { LLM_MODEL as ANTHROPIC_MODEL, callLLM as callClaude };
export type { LlmToolDef as AnthropicToolDef, LlmMessage as AnthropicMessage, LlmCallResult as ClaudeCallResult } from "@/lib/llm";

/** LangChain / LangGraph chat model. */
export function langchainChatModel(maxTokens: number): BaseChatModel {
  if (LLM_PROVIDER === "anthropic") {
    // No temperature: claude-sonnet-5-5 only accepts the default.
    return new ChatAnthropic({
      model: LLM_MODEL,
      apiKey: process.env.ANTHROPIC_API_KEY,
      anthropicApiUrl: ANTHROPIC_BASE_URL,
      maxTokens,
    });
  }
  return new ChatOpenAI({
    model: LLM_MODEL,
    apiKey: OPENAI_API_KEY,
    maxTokens,
    configuration: { baseURL: OPENAI_BASE_URL },
  });
}

let openaiCompatible: ReturnType<typeof createOpenAICompatible> | null = null;

/** Vercel AI SDK (and Mastra) language model. */
export function aiSdkModel(): LanguageModel {
  if (LLM_PROVIDER === "anthropic") return anthropic(LLM_MODEL);
  if (!openaiCompatible) {
    openaiCompatible = createOpenAICompatible({
      name: "openai-compatible",
      baseURL: OPENAI_BASE_URL,
      apiKey: OPENAI_API_KEY,
      includeUsage: true,
    });
  }
  // Same LanguageModelV4 spec; only the nested @ai-sdk/provider copy differs.
  return openaiCompatible.chatModel(LLM_MODEL) as unknown as LanguageModel;
}

/** Level 1 SDK label shown in traces and steps. */
export const LEVEL1_SDK = LLM_PROVIDER === "anthropic" ? "@anthropic-ai/sdk" : "openai (OpenAI-compatible SDK)";
