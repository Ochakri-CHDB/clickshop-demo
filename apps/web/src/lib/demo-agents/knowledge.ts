/**
 * Shared ClickShop knowledge base + lightweight hash embeddings.
 * Used by the LlamaIndex RAG runner (level 3) and the LangGraph
 * orchestrator's knowledge retriever (level 6).
 */

export interface KnowledgeDoc {
  id: string;
  title: string;
  text: string;
}

export const KNOWLEDGE_DOCS: KnowledgeDoc[] = [
  {
    id: "kb-fraud",
    title: "Fraud detection playbook",
    text: "ClickShop detects payment fraud with four signals: velocity abuse (more than 5 orders per customer per hour), card testing (many small failed payments followed by a large one), amount outliers (order value above the 99th percentile per category), and geo mismatch (IP country different from card issuing country). Alerts stream into the fraud dashboard from payment_events in ClickHouse.",
  },
  {
    id: "kb-funnel",
    title: "Checkout funnel definition",
    text: "The ClickShop funnel has five stages tracked in ClickHouse: page_events (browse), cart_events (add to cart), checkout_events (start checkout), payment_events (payment attempt), order_events (completed order). Historical drop-off is highest between checkout start and payment attempt (about 35%), often driven by shipping costs shown late.",
  },
  {
    id: "kb-payments",
    title: "Payment providers and failures",
    text: "ClickShop routes payments through two providers with automatic failover. A normal failure rate is 4-6%. A spike above 10% for one provider usually indicates a provider incident: check payment_events grouped by provider and error_code, then enable rerouting.",
  },
  {
    id: "kb-catalog",
    title: "Catalog and categories",
    text: "The catalog covers electronics, fashion, home, sports and beauty categories stored in PostgreSQL (products table) while sales analytics live in ClickHouse (order_events, product_performance_hourly). Electronics drives roughly 40% of revenue with the highest average order value.",
  },
  {
    id: "kb-vip",
    title: "VIP customer program",
    text: "Customers flagged in vip_customer_flags (PostgreSQL) get priority support and free shipping. VIPs represent about 8% of customers but 30% of revenue. Churn risk for VIPs is monitored via declining order frequency in customer_activity.",
  },
  {
    id: "kb-observability",
    title: "AI observability stack",
    text: "Every AI feature in ClickShop is traced with Langfuse: traces contain agent, tool, retriever, generation, guardrail and evaluator observations. LLM-as-a-judge scores (helpfulness, groundedness, safety) are attached to traces via the Scores API, and daily dataset experiments run against a demo eval set.",
  },
  {
    id: "kb-freshness",
    title: "Data freshness SLA",
    text: "ClickShop events land in ClickHouse within 2 minutes via streaming ingest. Gold aggregate tables are refreshed every 15 minutes by the medallion jobs. Freshness is monitored with max(event_time) lag alerts: a lag above 10 minutes on order_events pages the data on-call.",
  },
  {
    id: "kb-dedup",
    title: "Duplicate handling policy",
    text: "order_events is deduplicated by event_id using a ReplacingMergeTree engine. Late or retried events are accepted within a 24-hour window. Downstream dashboards must read with FINAL or argMax to avoid counting duplicates before background merges complete.",
  },
  {
    id: "kb-nulls",
    title: "NULL-rate policy for order totals",
    text: "total_amount on order_events must never be NULL. A null rate above 0.5% triggers a data-quality alert. The usual root cause is upstream schema drift in the checkout service; the standard fix is to patch the ingestion mapping and backfill the affected partitions.",
  },
  {
    id: "kb-returns",
    title: "Returns and refunds",
    text: "Refunds appear in payment_events with status 'refunded'. The average return rate is 6% overall and 11% in fashion, the highest category. Refunds are reconciled nightly against the orders table in PostgreSQL; unreconciled refunds older than 48 hours raise a finance alert.",
  },
  {
    id: "kb-retention",
    title: "Data retention and GDPR",
    text: "Raw events are kept 18 months in ClickHouse via TTL clauses. Customer PII is pseudonymized in analytics tables. GDPR deletion requests originate in PostgreSQL and propagate to ClickHouse within 72 hours through lightweight deletes.",
  },
  {
    id: "kb-inventory",
    title: "Inventory synchronization",
    text: "Stock levels sync from PostgreSQL to ClickHouse every 5 minutes through CDC. An oversell alert fires when reserved quantity exceeds available stock. Electronics has the tightest stock buffers because of its high average order value.",
  },
];

/** Deterministic bag-of-words hash embedding (no external embedding API needed). */
export function hashEmbed(text: string, dims = 64): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    vec[Math.abs(h) % dims] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return Number(dot.toFixed(4));
}

/** Score all knowledge docs against a query, highest first. */
export function scoreKnowledge(query: string): Array<KnowledgeDoc & { score: number }> {
  const qv = hashEmbed(query);
  return KNOWLEDGE_DOCS.map((doc) => ({
    ...doc,
    score: cosine(qv, hashEmbed(`${doc.title} ${doc.text}`)),
  })).sort((a, b) => b.score - a.score);
}
