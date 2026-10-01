import { runLangfuseObservation } from "@/lib/langfuse-observations";
import { LLM_MODEL as MODEL, LLM_PROVIDER, callLLM, llmEndpoint } from "@/lib/llm";

/**
 * One-shot agent call on the configured LLM (Anthropic or the OpenAI-compatible
 * endpoint, Ollama by default), traced in Langfuse. `spec` only labels the trace.
 */
export async function askAgent(spec: string, message: string): Promise<string> {
  return runLangfuseObservation(
    {
      name: "clickshop.ask-agent",
      asType: "agent",
      model: MODEL,
      input: [{ role: "user", content: message }],
      metadata: { agentSpec: spec, provider: LLM_PROVIDER },
      traceName: "clickshop-agent-runtime",
    },
    async (agentObservation) => {
      const outputText = await runLangfuseObservation(
        {
          name: `${LLM_PROVIDER}.chat`,
          asType: "generation",
          model: MODEL,
          input: [{ role: "user", content: message }],
          metadata: { url: llmEndpoint(), spec },
          traceName: "clickshop-agent-runtime",
        },
        async (generation) => {
          const res = await callLLM({ messages: [{ role: "user", content: message }], maxTokens: 2048 });
          generation?.update({ output: res.text, usageDetails: { input: res.usage.input, output: res.usage.output } });
          return res.text;
        },
      );

      agentObservation?.update({ output: outputText, metadata: { agentSpec: spec, provider: LLM_PROVIDER } });
      if (!outputText.trim()) throw new Error("Agent returned an empty response");
      return outputText;
    },
  );
}
