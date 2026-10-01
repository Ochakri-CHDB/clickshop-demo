import { NextRequest, NextResponse } from "next/server";
import { getPrompt } from "@/lib/langfuse-prompts";
import { recordLangfuseEvent, runLangfuseObservation } from "@/lib/langfuse-observations";
import { requireSession } from "@/lib/api-guard";
import { LLM_MODEL, LLM_PROVIDER, callLLM, llmEndpoint } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = LLM_MODEL;

async function pdfToText(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

const FALLBACK_PROMPT = `You are a sales contract data extraction agent. Analyze the provided document and extract ALL relevant sales/order information.

Return a JSON object with this exact structure (fill what you find, use null for missing fields):

{
  "customer": {
    "full_name": "string",
    "email": "string or null",
    "country": "string",
    "tier": "Standard | Premium | Enterprise",
    "is_vip": false
  },
  "order": {
    "status": "pending | confirmed | shipped | delivered",
    "total_amount": 0.00,
    "payment_method": "credit_card | bank_transfer | paypal | wire",
    "country": "string",
    "channel": "web | direct | partner | phone"
  },
  "items": [
    {
      "product_name": "string",
      "category": "string",
      "quantity": 1,
      "unit_price": 0.00,
      "total_price": 0.00
    }
  ],
  "payment": {
    "status": "pending | paid | partial",
    "provider": "string or null"
  },
  "summary": "One-line summary of the contract"
}

IMPORTANT:
- Extract real values from the document, do not invent data
- Amounts must be numbers (no currency symbols)
- Return ONLY valid JSON, no markdown fences, no explanation`;

export async function POST(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return runLangfuseObservation(
    {
      name: "contracts.extract.chain",
      asType: "chain",
      metadata: { route: "/api/contracts/extract" },
      traceName: "clickshop-contract-extract",
    },
    async () => {
      try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;

        const hasFile = await runLangfuseObservation(
          {
            name: "contracts.extract.guardrail.file",
            asType: "guardrail",
            traceName: "clickshop-contract-extract",
          },
          async (guardrailObservation) => {
            const valid = Boolean(file);
            guardrailObservation?.update({ output: { valid } });
            return valid;
          },
        );
        if (!hasFile) {
          return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }
        if (!file) {
          return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const uploadedFile = file;
        const buffer = Buffer.from(await uploadedFile.arrayBuffer());
        const base64 = buffer.toString("base64");
        const isPdf = uploadedFile.name.toLowerCase().endsWith(".pdf") || uploadedFile.type === "application/pdf";
        const mediaType = isPdf ? "application/pdf" : (uploadedFile.type || "application/octet-stream");

        await runLangfuseObservation(
          {
            name: "contracts.extract.file-span",
            asType: "span",
            input: { fileName: uploadedFile.name, size: uploadedFile.size, mediaType },
            traceName: "clickshop-contract-extract",
          },
          async () => undefined,
        );

        const { prompt: langfusePrompt } = await getPrompt("contract-extract");
        const extractionPrompt = langfusePrompt || FALLBACK_PROMPT;

        // Claude reads PDFs natively; OpenAI-compatible models get the extracted text.
        const content: Array<Record<string, unknown>> =
          LLM_PROVIDER === "anthropic"
            ? [
                { type: "document", source: { type: "base64", media_type: mediaType, data: base64 } },
                { type: "text", text: extractionPrompt },
              ]
            : [
                {
                  type: "text",
                  text: `DOCUMENT:\n${(isPdf ? await pdfToText(buffer) : buffer.toString("utf8")).slice(0, 20000)}\n\n${extractionPrompt}`,
                },
              ];

        const data = await runLangfuseObservation(
          {
            name: "contracts.extract.generation",
            asType: "generation",
            model: MODEL,
            input: { mediaType, promptLength: extractionPrompt.length },
            traceName: "clickshop-contract-extract",
          },
          async (generationObservation) => {
            const res = await runLangfuseObservation(
              {
                name: `contracts.extract.${LLM_PROVIDER}-call`,
                asType: "tool",
                input: { url: llmEndpoint(), model: MODEL },
                traceName: "clickshop-contract-extract",
              },
              async () => callLLM({ messages: [{ role: "user", content }], maxTokens: 4096 }),
            );
            generationObservation?.update({ usageDetails: { input: res.usage.input, output: res.usage.output } });
            return res;
          },
        );

        const reply = data.text;

        let extracted;
        try {
          const jsonMatch = reply.match(/\{[\s\S]*\}/);
          extracted = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        } catch {
          await recordLangfuseEvent(
            "contracts.extract.parse-failed",
            { fileName: uploadedFile.name },
            "clickshop-contract-extract",
          );
          return NextResponse.json(
            { error: "Failed to parse extracted data", raw: reply },
            { status: 422 },
          );
        }

        await runLangfuseObservation(
          {
            name: "contracts.extract.evaluator",
            asType: "evaluator",
            input: { hasCustomer: Boolean(extracted?.customer), itemCount: extracted?.items?.length ?? 0 },
            traceName: "clickshop-contract-extract",
          },
          async (evaluatorObservation) => {
            const score =
              (extracted?.customer ? 0.4 : 0) +
              (Array.isArray(extracted?.items) && extracted.items.length > 0 ? 0.4 : 0) +
              (extracted?.order ? 0.2 : 0);
            evaluatorObservation?.update({
              output: {
                score: Number(score.toFixed(2)),
                verdict: score >= 0.8 ? "complete" : "partial",
              },
            });
          },
        );

        return NextResponse.json({
          extracted,
          source: "librechat",
          promptSource: langfusePrompt ? "langfuse" : "fallback",
        });
      } catch (err) {
        console.error("[Contract Extract]", err);
        await recordLangfuseEvent(
          "contracts.extract.error",
          { message: (err as Error).message },
          "clickshop-contract-extract",
        );
        return NextResponse.json(
          { error: (err as Error).message },
          { status: 500 },
        );
      }
    },
  );
}
