import { recordLangfuseEvent, runLangfuseObservation } from "@/lib/langfuse-observations";

const LANGFUSE_BASE =
  process.env.LANGFUSE_BASE_URL || "https://cloud.langfuse.com";
const PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY ?? "";
const SECRET_KEY = process.env.LANGFUSE_SECRET_KEY ?? "";

const AUTH = Buffer.from(`${PUBLIC_KEY}:${SECRET_KEY}`).toString("base64");

interface LangfusePromptResponse {
  prompt: string;
  config: Record<string, unknown>;
  version: number;
  labels: string[];
}

const cache = new Map<string, { prompt: string; config: Record<string, unknown>; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export async function getPrompt(
  name: string,
  label = "production",
): Promise<{ prompt: string; config: Record<string, unknown> }> {
  return runLangfuseObservation(
    {
      name: "langfuse.prompt.lookup",
      asType: "retriever",
      input: { name, label },
      metadata: { source: "langfuse-prompt-api" },
      traceName: "clickshop-prompt-management",
    },
    async (retrieverObservation) => {
      const cacheKey = `${name}:${label}`;
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        await recordLangfuseEvent(
          "langfuse.prompt.cache-hit",
          { name, label },
          "clickshop-prompt-management",
        );
        return { prompt: cached.prompt, config: cached.config };
      }

      const url = `${LANGFUSE_BASE}/api/public/v2/prompts/${encodeURIComponent(name)}?label=${label}`;
      const res = await runLangfuseObservation(
        {
          name: "langfuse.prompt-api.fetch",
          asType: "tool",
          input: { url, label },
          metadata: { method: "GET" },
          traceName: "clickshop-prompt-management",
        },
        async () =>
          fetch(url, {
            headers: { Authorization: `Basic ${AUTH}` },
            next: { revalidate: 300 },
          }),
      );

      if (!res.ok) {
        console.warn(`[Langfuse] Prompt "${name}" not found (${res.status}), using fallback`);
        await recordLangfuseEvent(
          "langfuse.prompt.missing-fallback",
          { name, label, status: res.status },
          "clickshop-prompt-management",
        );
        return { prompt: "", config: {} };
      }

      const data: LangfusePromptResponse = await res.json();
      retrieverObservation?.update({
        output: { promptLength: data.prompt.length, version: data.version, labels: data.labels },
      });
      cache.set(cacheKey, { prompt: data.prompt, config: data.config ?? {}, ts: Date.now() });
      return { prompt: data.prompt, config: data.config ?? {} };
    },
  );
}
