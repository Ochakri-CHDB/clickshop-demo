import { NextRequest, NextResponse } from "next/server";
import { askAgent } from "@/lib/ask-agent";
import { getPrompt } from "@/lib/langfuse-prompts";
import { recordLangfuseEvent, runLangfuseObservation } from "@/lib/langfuse-observations";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const CH_SCHEMA = `Database: clickshop (ClickHouse)
Tables:
- order_events (event_id UUID, event_time DateTime, order_id UInt64, customer_id UInt64, total_amount Float64, currency String, status String, payment_method String, channel String, country String, category String, quantity UInt32)
- page_events (event_id UUID, event_time DateTime, session_id String, user_id UInt64, page_url String, event_type String, device_type String, country String, referrer String)
- cart_events (event_id UUID, event_time DateTime, session_id String, user_id UInt64, product_id UInt64, product_name String, category String, price Float64, quantity Int32, action String)
- checkout_events (event_id UUID, event_time DateTime, session_id String, user_id UInt64, cart_value Float64, item_count UInt32, event_type String, payment_method String, country String)
- payment_events (event_id UUID, event_time DateTime, order_id UInt64, user_id UInt64, amount Float64, currency String, payment_method String, provider String, status String, failure_reason String, country String)
- inventory_events (event_id UUID, event_time DateTime, product_id UInt64, product_name String, category String, warehouse String, quantity_change Int32, stock_after UInt32, event_type String)
- gold_revenue_daily (day Date, country String, category String, channel String, revenue Float64, orders UInt64, avg_order_value Float64, unique_customers UInt64)
- gold_funnel_daily (day Date, country String, page_views UInt64, cart_adds UInt64, checkouts UInt64, payments UInt64, orders UInt64)
ClickHouse syntax: use count(), toDate(), today(), now(), INTERVAL, uniq(), round(), groupArray(), arrayJoin(), etc.`;

const PG_SCHEMA = `Database: postgres (PostgreSQL)
Tables:
- customers (id SERIAL PK, email VARCHAR UNIQUE, full_name VARCHAR, country VARCHAR, tier VARCHAR DEFAULT 'Standard', is_vip BOOLEAN, created_at TIMESTAMPTZ)
- products (id SERIAL PK, sku VARCHAR UNIQUE, name VARCHAR, category VARCHAR, price NUMERIC(10,2), inventory_available INT, created_at TIMESTAMPTZ)
- orders (id SERIAL PK, customer_id INT FK→customers, status VARCHAR, total_amount NUMERIC(10,2), payment_method VARCHAR, country VARCHAR, channel VARCHAR DEFAULT 'web', created_at TIMESTAMPTZ)
- order_items (id SERIAL PK, order_id INT FK→orders, product_id INT FK→products, quantity INT, unit_price NUMERIC(10,2), total_price NUMERIC(10,2))
- payment_status_current (order_id INT PK FK→orders, status VARCHAR, provider VARCHAR, failure_reason VARCHAR, updated_at TIMESTAMPTZ)
- sales_rep_accounts (id SERIAL PK, rep_name VARCHAR, region VARCHAR, customer_id INT FK→customers, assigned_at TIMESTAMPTZ)
- vip_customer_flags (customer_id INT PK FK→customers, reason VARCHAR, flagged_at TIMESTAMPTZ)
PostgreSQL syntax: use standard SQL, ::numeric for casts, ILIKE for case-insensitive, etc.`;

const SPEC_MAP: Record<string, string> = {
  clickhouse: "clickshop-data-agent",
  postgres: "clickshop-sales-agent",
};

function createQuestionFingerprint(question: string): number[] {
  const buckets = Array.from({ length: 16 }, () => 0);
  for (let i = 0; i < question.length; i++) {
    const bucketIdx = i % buckets.length;
    buckets[bucketIdx] += question.charCodeAt(i);
  }
  const max = Math.max(...buckets, 1);
  return buckets.map((v) => Number((v / max).toFixed(4)));
}

export async function POST(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  return runLangfuseObservation(
    {
      name: "text2sql.request-chain",
      asType: "chain",
      metadata: { route: "/api/sql/text2sql" },
      traceName: "clickshop-text2sql",
    },
    async () => {
      try {
        const { question, database } = await req.json();

        const isQuestionValid = await runLangfuseObservation(
          {
            name: "text2sql.question-guardrail",
            asType: "guardrail",
            input: { questionLength: question?.length ?? 0 },
            traceName: "clickshop-text2sql",
          },
          async (guardrailObservation) => {
            const valid = Boolean(question?.trim());
            guardrailObservation?.update({ output: { valid } });
            return valid;
          },
        );
        if (!isQuestionValid) {
          await recordLangfuseEvent("text2sql.missing-question", undefined, "clickshop-text2sql");
          return NextResponse.json({ error: "No question provided" }, { status: 400 });
        }

        const schema = database === "postgres" ? PG_SCHEMA : CH_SCHEMA;
        const dbLabel = database === "postgres" ? "PostgreSQL" : "ClickHouse";
        const spec = SPEC_MAP[database] ?? SPEC_MAP.clickhouse;
        const promptName = database === "postgres" ? "text2sql-postgres" : "text2sql-clickhouse";

        await runLangfuseObservation(
          {
            name: "text2sql.question-embedding",
            asType: "embedding",
            model: "clickshop-hash-embedding-v1",
            input: question,
            traceName: "clickshop-text2sql",
          },
          async (embeddingObservation) => {
            const vector = createQuestionFingerprint(question);
            embeddingObservation?.update({
              output: { vectorDimensions: vector.length },
              usageDetails: { input: question.trim().split(/\s+/).length },
            });
          },
        );

        const { prompt: langfusePrompt } = await getPrompt(promptName);
        const systemPrompt = langfusePrompt ||
          `You are a ${dbLabel} SQL expert. Given a database schema and a user question, write a SQL query that answers it. Return ONLY the SQL query, no explanation, no markdown fences.`;

        const prompt = `${systemPrompt}\n\n${schema}\n\nUser question: "${question}"`;
        const reply = await askAgent(spec, prompt);
        let sql = reply.trim();
        sql = sql.replace(/^```\w*\n?/, "").replace(/\n?```$/, "").trim();

        await runLangfuseObservation(
          {
            name: "text2sql.output-evaluator",
            asType: "evaluator",
            input: { sql },
            traceName: "clickshop-text2sql",
          },
          async (evaluatorObservation) => {
            const looksLikeSql = /^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(sql);
            evaluatorObservation?.update({
              output: { looksLikeSql, length: sql.length },
            });
          },
        );

        return NextResponse.json({ sql, promptSource: langfusePrompt ? "langfuse" : "fallback" });
      } catch (err) {
        console.error("[Text2SQL]", err);
        await recordLangfuseEvent(
          "text2sql.error",
          { message: (err as Error).message },
          "clickshop-text2sql",
        );
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
      }
    },
  );
}
