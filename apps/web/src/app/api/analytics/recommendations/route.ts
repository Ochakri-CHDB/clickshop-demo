import { NextResponse } from "next/server";
import { queryClickHouse } from "@/lib/clickhouse";
import { askAgent } from "@/lib/ask-agent";
import { LLM_PROVIDER } from "@/lib/llm";
import { getPrompt } from "@/lib/langfuse-prompts";
import { recordLangfuseEvent, runLangfuseObservation } from "@/lib/langfuse-observations";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const SNAPSHOT_QUERIES = {
  todayKpi: `SELECT sum(total_amount) AS revenue, count() AS orders, round(avg(total_amount), 2) AS aov FROM order_events WHERE event_time >= today()`,
  yesterdayKpi: `SELECT sum(total_amount) AS revenue, count() AS orders, round(avg(total_amount), 2) AS aov FROM order_events WHERE toDate(event_time) = today() - 1`,
  topRegions: `SELECT country, sum(total_amount) AS revenue, count() AS orders FROM order_events WHERE event_time >= today() GROUP BY country ORDER BY revenue DESC LIMIT 5`,
  topCategories: `SELECT category, sum(total_amount) AS revenue, count() AS orders FROM order_events WHERE event_time >= today() GROUP BY category ORDER BY revenue DESC LIMIT 5`,
  paymentFailures: `SELECT status, count() AS cnt, sum(amount) AS impact FROM payment_events WHERE event_time >= today() AND status != 'success' GROUP BY status ORDER BY cnt DESC`,
  funnelData: `SELECT 'page_views' AS step, count() AS cnt FROM page_events WHERE event_time >= today() UNION ALL SELECT 'cart_adds', count() FROM cart_events WHERE event_time >= today() UNION ALL SELECT 'checkouts', count() FROM checkout_events WHERE event_time >= today() UNION ALL SELECT 'payments', count() FROM payment_events WHERE event_time >= today() UNION ALL SELECT 'orders', count() FROM order_events WHERE event_time >= today()`,
  fraudSignals: `SELECT customer_id, count() AS order_count, sum(total_amount) AS total_spent, max(total_amount) AS max_order, countIf(status = 'cancelled' OR status = 'refunded') AS cancelled_count FROM order_events WHERE event_time >= now() - INTERVAL 24 HOUR GROUP BY customer_id HAVING order_count >= 3 OR max_order > 500 OR cancelled_count >= 2 ORDER BY total_spent DESC LIMIT 10`,
};

async function getDataSnapshot(traceName: string) {
  const keys = Object.keys(SNAPSHOT_QUERIES) as (keyof typeof SNAPSHOT_QUERIES)[];
  const results = await Promise.all(
    keys.map((k) =>
      runLangfuseObservation(
        {
          name: `recommendations.snapshot.${k}`,
          asType: "retriever",
          input: { sql: SNAPSHOT_QUERIES[k] },
          metadata: { source: "clickhouse" },
          traceName,
        },
        async (retrieverObservation) => {
          const rows = await queryClickHouse(SNAPSHOT_QUERIES[k]);
          retrieverObservation?.update({ output: { rows: rows.length } });
          return rows;
        },
      ),
    ),
  );
  const snapshot: Record<string, unknown[]> = {};
  keys.forEach((k, i) => { snapshot[k] = results[i]; });
  return snapshot as { todayKpi: Record<string, unknown>[]; yesterdayKpi: Record<string, unknown>[]; topRegions: Record<string, unknown>[]; topCategories: Record<string, unknown>[]; paymentFailures: Record<string, unknown>[]; funnelData: Record<string, unknown>[]; fraudSignals: Record<string, unknown>[] };
}

function buildDataContext(snapshot: Awaited<ReturnType<typeof getDataSnapshot>>): string {
  const today = snapshot.todayKpi[0] as Record<string, unknown> | undefined;
  const yesterday = snapshot.yesterdayKpi[0] as Record<string, unknown> | undefined;

  return `
TODAY's metrics (${new Date().toISOString().split("T")[0]}):
- Revenue: €${Number(today?.revenue ?? 0).toLocaleString()}
- Orders: ${today?.orders ?? 0}
- AOV: €${today?.aov ?? 0}

YESTERDAY's metrics:
- Revenue: €${Number(yesterday?.revenue ?? 0).toLocaleString()}
- Orders: ${yesterday?.orders ?? 0}
- AOV: €${yesterday?.aov ?? 0}

Revenue change: ${yesterday?.revenue ? (((Number(today?.revenue ?? 0) - Number(yesterday?.revenue ?? 0)) / Number(yesterday?.revenue)) * 100).toFixed(1) : "N/A"}%

Top regions today: ${JSON.stringify(snapshot.topRegions)}
Top categories today: ${JSON.stringify(snapshot.topCategories)}
Payment failures today: ${JSON.stringify(snapshot.paymentFailures)}
Funnel today: ${JSON.stringify(snapshot.funnelData)}
Suspicious activity (possible fraud): ${JSON.stringify(snapshot.fraudSignals)}
  `.trim();
}

const SPEC_MAP: Record<string, string> = {
  ceo: "clickshop-ceo-agent",
  sales: "clickshop-sales-agent",
  fraud: "clickshop-fraud-agent",
  "ceo-executive-summary": "clickshop-ceo-agent",
  "ceo-risk-radar": "clickshop-ceo-agent",
  "ceo-growth-opportunities": "clickshop-ceo-agent",
  "ceo-competitive-intel": "clickshop-ceo-agent",
  "ceo-customer-pulse": "clickshop-ceo-agent",
  "ceo-forecast": "clickshop-ceo-agent",
  "sales-pipeline-review": "clickshop-sales-agent",
  "sales-churn-alert": "clickshop-sales-agent",
  "sales-deal-coach": "clickshop-sales-agent",
  "sales-territory-intel": "clickshop-sales-agent",
  "sales-pricing-optimizer": "clickshop-sales-agent",
  "sales-competitor-tracker": "clickshop-sales-agent",
  "data-anomaly-detector": "clickshop-data-agent",
  "data-pipeline-health": "clickshop-data-agent",
  "data-query-optimizer": "clickshop-data-agent",
  "data-schema-advisor": "clickshop-data-agent",
  "data-cost-analyzer": "clickshop-data-agent",
  "data-data-quality": "clickshop-data-agent",
};

const FALLBACK_INSTRUCTION: Record<string, string> = {
  ceo: "Using the live data below, generate exactly 5 short executive insights/recommendations for the CEO. Each must be 1 sentence, highlight a key metric or risk, and suggest action. Return ONLY a JSON array of 5 strings, no other text.",
  sales: "Using the live data below, generate exactly 5 short actionable recommendations for the sales team. Each must be 1 sentence, specific, and data-driven. Return ONLY a JSON array of 5 strings, no other text.",
  fraud: "Using the live data below including suspicious activity signals, generate exactly 5 fraud risk alerts. Each alert must be 1 sentence, flag the risk level (HIGH/MEDIUM/LOW), identify the pattern detected, and recommend an action. Return ONLY a JSON array of 5 strings, no other text.",
};

function parseRecommendations(text: string): string[] {
  try {
    const cleaned = text.replace(/```json\n?/g, "").replace(/```/g, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (Array.isArray(parsed)) return parsed;
    }
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return text
      .split("\n")
      .filter((l) => l.trim().length > 10)
      .slice(0, 5);
  }
}

export async function GET(request: Request) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;
  const { searchParams } = new URL(request.url);
  const persona = searchParams.get("persona") ?? "ceo";
  const userPrompt = searchParams.get("prompt") ?? "";
  const source = searchParams.get("source") ?? "unknown";
  const traceName = source === "agents-tab" ? "clickshop-ai-agents-tab" : "clickshop-recommendations";

  return runLangfuseObservation(
    {
      name: "recommendations.agent-request",
      asType: "agent",
      input: { persona, hasUserPrompt: Boolean(userPrompt), source },
      metadata: { route: "/api/analytics/recommendations", source },
      traceName,
    },
    async (agentObservation) => {
      try {
        const spec = SPEC_MAP[persona];
        if (!spec) {
          await recordLangfuseEvent(
            "recommendations.unknown-persona",
            { persona, source },
            traceName,
          );
          return NextResponse.json({ recommendations: [], error: `Unknown persona: ${persona}` });
        }

        const snapshot = await runLangfuseObservation(
          {
            name: "recommendations.snapshot-build",
            asType: "chain",
            metadata: { queryCount: Object.keys(SNAPSHOT_QUERIES).length },
            traceName,
          },
          async () => getDataSnapshot(traceName),
        );
        const dataContext = buildDataContext(snapshot);
        const today = snapshot.todayKpi[0] as Record<string, unknown> | undefined;
        const yesterday = snapshot.yesterdayKpi[0] as Record<string, unknown> | undefined;

        const { prompt: langfusePrompt } = await getPrompt(`recommendations-${persona}`);
        const baseInstruction = langfusePrompt || FALLBACK_INSTRUCTION[persona] || FALLBACK_INSTRUCTION.ceo;
        const instruction = userPrompt
          ? `The user asks: "${userPrompt}"\n\nUsing this question as your focus, ${baseInstruction}`
          : baseInstruction;

        const agentReply = await askAgent(spec, `${instruction}\n\nDATA:\n${dataContext}`);
        const recommendations = agentReply && agentReply.length > 10
          ? parseRecommendations(agentReply)
          : [];

        const guardrailPassed = await runLangfuseObservation(
          {
            name: "recommendations.output-guardrail",
            asType: "guardrail",
            input: { recommendationCount: recommendations.length },
            traceName,
          },
          async (guardrailObservation) => {
            const passed = recommendations.length > 0 && recommendations.every((r) => r.trim().length > 10);
            guardrailObservation?.update({
              output: { passed, recommendationCount: recommendations.length },
            });
            return passed;
          },
        );

        await runLangfuseObservation(
          {
            name: "recommendations.quality-evaluator",
            asType: "evaluator",
            input: { recommendations },
            traceName,
          },
          async (evaluatorObservation) => {
            const score = Math.min(
              1,
              recommendations.reduce((acc, rec) => acc + Math.min(rec.length / 140, 1), 0) / Math.max(recommendations.length, 1),
            );
            evaluatorObservation?.update({
              output: {
                score: Number(score.toFixed(2)),
                verdict: score >= 0.7 ? "strong" : "needs-review",
              },
            });
          },
        );

        if (!guardrailPassed) {
          await recordLangfuseEvent(
            "recommendations.empty-response",
            { persona, source, provider: LLM_PROVIDER },
            traceName,
          );
          return NextResponse.json({
            recommendations: [],
            error: `The LLM (${LLM_PROVIDER}) returned no usable recommendations.`,
          });
        }

        const revenueChange = yesterday?.revenue
          ? ((Number(today?.revenue ?? 0) - Number(yesterday?.revenue ?? 0)) / Number(yesterday?.revenue)) * 100
          : 0;
        const ordersChange = yesterday?.orders
          ? ((Number(today?.orders ?? 0) - Number(yesterday?.orders ?? 0)) / Number(yesterday?.orders)) * 100
          : 0;

        agentObservation?.update({
          output: { recommendationCount: recommendations.length, persona, source },
        });

        return NextResponse.json({
          recommendations,
          promptSource: langfusePrompt ? "langfuse" : "fallback",
          fraudSignals: snapshot.fraudSignals,
          changes: {
            revenue: Math.round(revenueChange * 10) / 10,
            orders: Math.round(ordersChange * 10) / 10,
          },
          queries: Object.entries(SNAPSHOT_QUERIES).map(([name, sql]) => ({ name, sql })),
        });
      } catch (err) {
        console.error("[Recommendations] Error:", (err as Error).message);
        await recordLangfuseEvent(
          "recommendations.error",
          { message: (err as Error).message, persona, source },
          traceName,
        );
        return NextResponse.json({ recommendations: [], error: (err as Error).message });
      }
    },
  );
}
