/**
 * Level 1 — Simple Chat, built on the provider's official TypeScript SDK:
 * @anthropic-ai/sdk when LLM_PROVIDER=anthropic, the `openai` SDK against
 * the OpenAI-compatible endpoint (Ollama) otherwise. The baseline: one call,
 * traced as a single Langfuse GENERATION with model + token usage.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { runLangfuseObservation } from "@/lib/langfuse-observations";
import { ANTHROPIC_BASE_URL, LLM_MODEL, LLM_PROVIDER, OPENAI_API_KEY, OPENAI_BASE_URL } from "@/lib/llm";
import { LEVEL1_SDK } from "./anthropic";
import type { DemoStep } from "./index";

let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

async function complete(system: string, prompt: string) {
  if (LLM_PROVIDER === "anthropic") {
    if (!anthropicClient) {
      anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: ANTHROPIC_BASE_URL });
    }
    const res = await anthropicClient.messages.create({
      model: LLM_MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
    return { text, input: res.usage.input_tokens, output: res.usage.output_tokens, stop: String(res.stop_reason) };
  }
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY, baseURL: OPENAI_BASE_URL });
  const res = await openaiClient.chat.completions.create({
    model: LLM_MODEL,
    max_tokens: 1024,
    messages: [
      { role: "system", content: system },
      { role: "user", content: prompt },
    ],
  });
  return {
    text: res.choices[0]?.message?.content ?? "",
    input: res.usage?.prompt_tokens ?? 0,
    output: res.usage?.completion_tokens ?? 0,
    stop: String(res.choices[0]?.finish_reason ?? "stop"),
  };
}

export async function runSimpleChatAnthropicSdk(
  prompt: string,
  addStep: (step: DemoStep) => void,
  domain: string,
): Promise<string> {
  return runLangfuseObservation(
    {
      name: "simple-chat.answer",
      asType: "generation",
      model: LLM_MODEL,
      input: [
        { role: "system", content: domain.slice(0, 1500) },
        { role: "user", content: prompt.slice(0, 2000) },
      ],
      metadata: { framework: LEVEL1_SDK },
    },
    async (genObs) => {
      const res = await complete(domain, prompt);
      genObs?.update({
        output: res.text,
        usageDetails: { input: res.input, output: res.output },
        metadata: { stopReason: res.stop },
      });
      addStep({
        type: "GENERATION",
        name: "simple-chat.answer",
        summary: `${res.input}→${res.output} tokens (${LEVEL1_SDK})`,
      });
      return res.text;
    },
  );
}
