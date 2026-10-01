/**
 * Level 2 — Prompt Chain, built with LangChain.js (LCEL).
 *
 * A RunnableSequence pipes two ChatAnthropic prompts: (1) rewrite + classify
 * the messy question, (2) answer the refined question. The run is traced by
 * the native Langfuse CallbackHandler (@langfuse/langchain), which emits the
 * CHAIN + GENERATION observations (with token usage) inside the active trace.
 */
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { RunnableLambda, RunnableSequence } from "@langchain/core/runnables";
import type { AIMessage } from "@langchain/core/messages";
import { CallbackHandler } from "@langfuse/langchain";
import { runLangfuseObservation, recordLangfuseEvent } from "@/lib/langfuse-observations";
import { langchainChatModel } from "./anthropic";
import type { DemoStep } from "./index";

function getLlm(maxTokens: number) {
  return langchainChatModel(maxTokens);
}

function messageText(msg: AIMessage): string {
  if (typeof msg.content === "string") return msg.content;
  return msg.content
    .map((part) => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : ""))
    .join("\n");
}

function usageSummary(msg: AIMessage): string {
  const usage = msg.usage_metadata;
  return usage ? `${usage.input_tokens}→${usage.output_tokens} tokens` : "usage n/a";
}

export async function runPromptChainLangChain(
  prompt: string,
  addStep: (step: DemoStep) => void,
  domain: string,
): Promise<string> {
  return runLangfuseObservation(
    {
      name: "prompt-chain",
      asType: "chain",
      input: { question: prompt },
      metadata: { framework: "LangChain.js", pattern: "RunnableSequence" },
    },
    async (chainObs) => {
      const state = { topic: "other", refined: prompt };

      const rewriteStep = ChatPromptTemplate.fromMessages([
        [
          "system",
          'Rewrite the user\'s question as a clear, specific technical question. Also classify its topic (performance|schema|cost|quality|other). Reply as JSON: {{"question": "...", "topic": "..."}}',
        ],
        ["human", "{question}"],
      ])
        .pipe(getLlm(250))
        .withConfig({ runName: "chain.step1-rewrite" });

      const parseAndClassify = RunnableLambda.from(async (msg: AIMessage) => {
        const text = messageText(msg);
        try {
          const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
          state.refined = String(parsed.question || prompt);
          state.topic = String(parsed.topic || "other");
        } catch {
          /* keep defaults */
        }
        addStep({ type: "GENERATION", name: "chain.step1-rewrite", summary: usageSummary(msg) });
        await recordLangfuseEvent("chain.topic-classified", {
          topic: state.topic,
          refined: state.refined.slice(0, 200),
        });
        addStep({ type: "EVENT", name: "chain.topic-classified", summary: `topic=${state.topic}` });
        return { refined: state.refined, topic: state.topic };
      }).withConfig({ runName: "chain.parse-topic" });

      const answerStep = ChatPromptTemplate.fromMessages([
        ["system", `${domain} Topic: {topic}. Give a structured, actionable answer in under 150 words.`],
        ["human", "{refined}"],
      ])
        .pipe(getLlm(1024))
        .withConfig({ runName: "chain.step2-answer" });

      const sequence = RunnableSequence.from([rewriteStep, parseAndClassify, answerStep]).withConfig({
        runName: "langchain.prompt-chain",
      });

      const handler = new CallbackHandler({ tags: ["trace-playground", "langchain"] });
      const finalMsg = (await sequence.invoke({ question: prompt }, { callbacks: [handler] })) as AIMessage;
      const answer = messageText(finalMsg);

      addStep({ type: "GENERATION", name: "chain.step2-answer", summary: usageSummary(finalMsg) });
      chainObs?.update({
        output: { topic: state.topic, refinedQuestion: state.refined, answer: answer.slice(0, 500) },
      });
      return answer;
    },
  );
}
