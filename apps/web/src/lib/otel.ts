import { trace, metrics, context, SpanStatusCode, type Span } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

const TRACER_NAME = "clickshop-api";
const METER_NAME = "clickshop-api";
const LOGGER_NAME = "clickshop-api";

export function getTracer() {
  return trace.getTracer(TRACER_NAME);
}

export function getMeter() {
  return metrics.getMeter(METER_NAME);
}

export function getLogger() {
  return logs.getLogger(LOGGER_NAME);
}

export function sendTestTrace(attributes?: Record<string, string>): { traceId: string; spanId: string } {
  const tracer = getTracer();
  const logger = getLogger();
  let traceId = "";
  let spanId = "";

  const isError = attributes?.["http.status_code"] === "500" || Math.random() < 0.08;
  const statusCode = isError ? SpanStatusCode.ERROR : SpanStatusCode.OK;
  const route = attributes?.["http.route"] ?? "/api/unknown";

  tracer.startActiveSpan("clickshop.http.request", (span: Span) => {
    span.setAttribute("component", "http");
    span.setAttribute("service.name", "clickshop-api");
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) span.setAttribute(k, v);
    }

    // Emit a log correlated to this trace
    logger.emit({
      severityNumber: isError ? SeverityNumber.ERROR : SeverityNumber.INFO,
      severityText: isError ? "ERROR" : "INFO",
      body: `${attributes?.["http.method"] ?? "GET"} ${route} → ${isError ? "500" : "200"}`,
      context: context.active(),
      attributes: { component: "http", "http.route": route },
    });

    // ── ClickHouse query (always) ──
    tracer.startActiveSpan("clickhouse.query", (ch: Span) => {
      ch.setAttribute("db.system", "clickhouse");
      ch.setAttribute("db.name", "clickshop");
      ch.setAttribute("peer.service", "clickhouse");
      ch.setAttribute("server.address", process.env.CLICKHOUSE_HOST ?? "clickhouse");
      const tables = ["order_events", "gold_revenue_daily", "silver_orders", "payment_events", "gold_daily_kpi"];
      const table = tables[Math.floor(Math.random() * tables.length)];
      ch.setAttribute("db.statement", `SELECT * FROM clickshop.${table} LIMIT 1000`);
      const latency = Math.floor(Math.random() * 300 + 5);
      ch.setAttribute("db.latency_ms", latency);
      ch.addEvent("query_started");
      ch.addEvent("query_completed", { "db.rows_returned": Math.floor(Math.random() * 10000) });
      ch.setStatus({ code: latency > 250 ? SpanStatusCode.ERROR : SpanStatusCode.OK, message: latency > 250 ? "slow query" : undefined });
      ch.end();
    });

    // ── PostgreSQL query (40%) ──
    if (Math.random() < 0.4) {
      tracer.startActiveSpan("postgresql.query", (pg: Span) => {
        pg.setAttribute("db.system", "postgresql");
        pg.setAttribute("db.name", "postgres");
        pg.setAttribute("peer.service", "postgresql");
        pg.setAttribute("server.address", process.env.POSTGRES_HOST ?? "postgres");
        const ops = ["SELECT * FROM orders WHERE id=$1", "UPDATE customers SET last_seen=now()", "INSERT INTO orders VALUES(...)"];
        pg.setAttribute("db.statement", ops[Math.floor(Math.random() * ops.length)]);
        pg.setStatus({ code: SpanStatusCode.OK });
        pg.end();
      });
    }

    // ── LibreChat → DocumentDB → Meilisearch → RAG API → VectorDB chain (30%) ──
    if (Math.random() < 0.3) {
      tracer.startActiveSpan("HTTP POST /api/chat", (lc: Span) => {
        lc.setAttribute("peer.service", "LibreChat-NGINX");
        lc.setAttribute("server.address", "localhost:4243");
        lc.setAttribute("http.method", "POST");
        lc.setAttribute("http.url", "/api/chat");

        // NGINX → LibreChat-API
        tracer.startActiveSpan("proxy_pass /api/chat", (api: Span) => {
          api.setAttribute("peer.service", "LibreChat-API");
          api.setAttribute("server.address", "librechat:3080");
          api.setAttribute("http.method", "POST");
          const agent = ["clickshop-ceo-agent", "clickshop-sales-agent", "clickshop-data-agent"][Math.floor(Math.random() * 3)];
          api.setAttribute("ai.agent", agent);

          logger.emit({
            severityNumber: SeverityNumber.INFO,
            severityText: "INFO",
            body: `Agent ${agent} processing request`,
            context: context.active(),
            attributes: { component: "librechat", "ai.agent": agent },
          });

          // LibreChat-API → DocumentDB (conversation storage)
          tracer.startActiveSpan("documentdb.findOne", (mongo: Span) => {
            mongo.setAttribute("db.system", "documentdb");
            mongo.setAttribute("peer.service", "chat-documentdb");
            mongo.setAttribute("server.address", "documentdb:27017");
            mongo.setAttribute("db.name", "LibreChat");
            mongo.setAttribute("db.collection", ["messages", "users", "conversations", "presets"][Math.floor(Math.random() * 4)]);
            mongo.setAttribute("db.operation", ["find", "findOne", "insertOne", "updateOne"][Math.floor(Math.random() * 4)]);
            mongo.setStatus({ code: SpanStatusCode.OK });
            mongo.end();
          });

          // LibreChat-API → Meilisearch (search index, 50%)
          if (Math.random() < 0.5) {
            tracer.startActiveSpan("meilisearch.search", (ms: Span) => {
              ms.setAttribute("peer.service", "chat-meilisearch");
              ms.setAttribute("server.address", "meilisearch:7700");
              ms.setAttribute("http.method", "POST");
              ms.setAttribute("db.operation", "search");
              ms.setStatus({ code: SpanStatusCode.OK });
              ms.end();
            });
          }

          // LibreChat-API → RAG API (retrieval, 60%)
          if (Math.random() < 0.6) {
            tracer.startActiveSpan("rag.retrieve", (rag: Span) => {
              rag.setAttribute("peer.service", "librechat-rag-api");
              rag.setAttribute("server.address", "rag_api:8000");
              rag.setAttribute("http.method", "POST");
              rag.setAttribute("http.url", "/api/retrieve");

              // RAG API → VectorDB (pgvector)
              tracer.startActiveSpan("vectordb.similarity_search", (vdb: Span) => {
                vdb.setAttribute("peer.service", "librechat-vectordb");
                vdb.setAttribute("db.system", "postgresql");
                vdb.setAttribute("server.address", "vectordb:5432");
                vdb.setAttribute("db.statement", "SELECT * FROM embeddings ORDER BY embedding <=> $1 LIMIT 5");
                vdb.setAttribute("db.operation", "similarity_search");
                vdb.setStatus({ code: SpanStatusCode.OK });
                vdb.end();
              });

              rag.setStatus({ code: SpanStatusCode.OK });
              rag.end();
            });
          }

          api.setStatus({ code: SpanStatusCode.OK });
          api.end();
        });

        lc.setStatus({ code: SpanStatusCode.OK });
        lc.end();
      });
    }

    // ── Direct DocumentDB call from API (20%) ──
    if (Math.random() < 0.2) {
      tracer.startActiveSpan("documentdb.query", (mongo: Span) => {
        mongo.setAttribute("db.system", "documentdb");
        mongo.setAttribute("peer.service", "clickshop-documentdb");
        mongo.setAttribute("server.address", "documentdb:27018");
        mongo.setAttribute("db.name", "clickshop");
        mongo.setAttribute("db.operation", ["find", "insert", "update"][Math.floor(Math.random() * 3)]);
        mongo.setAttribute("db.collection", ["sessions", "analytics_cache", "user_prefs"][Math.floor(Math.random() * 3)]);
        mongo.setStatus({ code: SpanStatusCode.OK });
        mongo.end();
      });
    }

    // ── Langfuse observability (15%) ──
    if (Math.random() < 0.15) {
      tracer.startActiveSpan("langfuse.ingest", (lf: Span) => {
        lf.setAttribute("peer.service", "langfuse");
        lf.setAttribute("server.address", (process.env.LANGFUSE_BASE_URL ?? "http://langfuse").replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
        lf.setAttribute("http.method", "POST");
        lf.setAttribute("http.url", "/api/public/ingestion");
        lf.setAttribute("langfuse.event_type", ["trace", "generation", "score"][Math.floor(Math.random() * 3)]);
        lf.setStatus({ code: SpanStatusCode.OK });
        lf.end();
      });
    }

    // ── OTel Collector (self-reporting, 10%) ──
    if (Math.random() < 0.1) {
      tracer.startActiveSpan("otel-collector.export", (oc: Span) => {
        oc.setAttribute("peer.service", "otel-collector");
        oc.setAttribute("server.address", "localhost:4318");
        oc.setAttribute("otel.signal", ["traces", "metrics", "logs"][Math.floor(Math.random() * 3)]);
        oc.setStatus({ code: SpanStatusCode.OK });
        oc.end();
      });
    }

    traceId = span.spanContext().traceId;
    spanId = span.spanContext().spanId;
    span.setStatus({ code: statusCode, message: isError ? "internal server error" : undefined });
    span.end();
  });

  return { traceId, spanId };
}

export function sendTestLog(message: string, severity: "info" | "warn" | "error" = "info") {
  const logger = getLogger();
  const sevMap = {
    info: SeverityNumber.INFO,
    warn: SeverityNumber.WARN,
    error: SeverityNumber.ERROR,
  };

  logger.emit({
    severityNumber: sevMap[severity],
    severityText: severity.toUpperCase(),
    body: message,
    context: context.active(),
    attributes: {
      "service.name": "clickshop-api",
      component: "diagnostics",
      test: true,
    },
  });
}

export function sendTestMetrics() {
  const meter = getMeter();

  const requestCounter = meter.createCounter("clickshop.test.requests", {
    description: "Test request counter",
  });
  requestCounter.add(1, {
    "service.name": "clickshop-api",
    component: "diagnostics",
    method: "GET",
    route: "/api/otel/test",
  });

  const latencyHistogram = meter.createHistogram("clickshop.test.latency", {
    description: "Test latency histogram",
    unit: "ms",
  });
  latencyHistogram.record(Math.random() * 200 + 10, {
    "service.name": "clickshop-api",
    component: "diagnostics",
  });

  const activeGauge = meter.createUpDownCounter("clickshop.test.active_connections", {
    description: "Test active connections gauge",
  });
  activeGauge.add(Math.floor(Math.random() * 10) + 1, {
    "service.name": "clickshop-api",
  });
}

// ── Multi-service OTLP sender ──────────────────────────────────────────
// Sends raw OTLP JSON to the collector so each downstream service appears
// with its own ServiceName (required for ClickStack's service map nodes).

function hexId(bytes: number): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  name: string;
  kind: number; // 1=INTERNAL, 2=SERVER, 3=CLIENT
  startNano: bigint;
  endNano: bigint;
  attrs: Record<string, string | number | boolean>;
  status: number; // 0=UNSET, 1=OK, 2=ERROR
}

function makeOtlpAttr(key: string, value: string | number | boolean) {
  if (typeof value === "string") return { key, value: { stringValue: value } };
  if (typeof value === "number") {
    if (Number.isInteger(value)) return { key, value: { intValue: String(value) } };
    return { key, value: { doubleValue: value } };
  }
  return { key, value: { boolValue: value } };
}

function buildOtlpPayload(spansByService: Map<string, OtlpSpan[]>) {
  const resourceSpans: unknown[] = [];
  for (const [service, spans] of spansByService) {
    resourceSpans.push({
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: service } },
          { key: "service.namespace", value: { stringValue: "clickshop" } },
        ],
      },
      scopeSpans: [
        {
          scope: { name: "clickshop-sim" },
          spans: spans.map((s) => ({
            traceId: s.traceId,
            spanId: s.spanId,
            parentSpanId: s.parentSpanId,
            name: s.name,
            kind: s.kind,
            startTimeUnixNano: s.startNano.toString(),
            endTimeUnixNano: s.endNano.toString(),
            attributes: Object.entries(s.attrs).map(([k, v]) => makeOtlpAttr(k, v)),
            status: { code: s.status },
          })),
        },
      ],
    });
  }
  return { resourceSpans };
}

const OTEL_PERSONAS = [
  { id: "ceo", email: "ceo@clickshop.io" },
  { id: "sales", email: "sales@clickshop.io" },
  { id: "data", email: "data@clickshop.io" },
  { id: "admin", email: "admin@clickshop.io" },
];
let _personaIdx = 0;

function readUserAttrs(): { "user.id": string; "user.email": string; "session.id": string } {
  const p = OTEL_PERSONAS[_personaIdx % OTEL_PERSONAS.length];
  _personaIdx++;
  return {
    "user.id": p.id,
    "user.email": p.email,
    "session.id": `sg-${p.id}-${Math.floor(Date.now() / 60000)}`,
  };
}

export async function sendServiceGraphTrace(): Promise<string> {
  const traceId = hexId(16);
  const now = BigInt(Date.now()) * 1_000_000n; // nanoseconds
  const ms = (n: number) => BigInt(n) * 1_000_000n;
  const userAttrs = readUserAttrs();

  const spansByService = new Map<string, OtlpSpan[]>();
  const add = (service: string, span: OtlpSpan) => {
    if (!spansByService.has(service)) spansByService.set(service, []);
    spansByService.get(service)!.push(span);
  };

  // ── Root: clickshop-frontend (browser) ──
  const frontendId = hexId(8);
  const frontendStart = now;
  const frontendEnd = now + ms(850);
  add("clickshop-frontend", {
    traceId, spanId: frontendId, parentSpanId: "",
    name: "HTTP GET /dashboard", kind: 3,
    startNano: frontendStart, endNano: frontendEnd,
    attrs: { "http.method": "GET", "http.url": "/dashboard", "peer.service": "clickshop-api", ...userAttrs },
    status: 1,
  });

  // ── clickshop-api (Next.js server) ──
  const apiId = hexId(8);
  const apiStart = now + ms(5);
  const apiEnd = now + ms(840);
  add("clickshop-api", {
    traceId, spanId: apiId, parentSpanId: frontendId,
    name: "GET /api/analytics/ceo", kind: 2,
    startNano: apiStart, endNano: apiEnd,
    attrs: { "http.method": "GET", "http.route": "/api/analytics/ceo", "http.status_code": "200", ...userAttrs },
    status: 1,
  });

  // ── clickshop-api → clickhouse ──
  const chClientId = hexId(8);
  const chServerId = hexId(8);
  const chStart = now + ms(10);
  const chEnd = now + ms(120);
  add("clickshop-api", {
    traceId, spanId: chClientId, parentSpanId: apiId,
    name: "clickhouse.query", kind: 3,
    startNano: chStart, endNano: chEnd,
    attrs: { "db.system": "clickhouse", "peer.service": "clickhouse", "db.statement": "SELECT * FROM gold_daily_kpi" },
    status: 1,
  });
  add("clickhouse", {
    traceId, spanId: chServerId, parentSpanId: chClientId,
    name: "SELECT gold_daily_kpi", kind: 2,
    startNano: chStart + ms(2), endNano: chEnd - ms(2),
    attrs: { "db.system": "clickhouse", "db.name": "clickshop", "db.rows_returned": Math.floor(Math.random() * 500) },
    status: 1,
  });

  // ── clickshop-api → postgresql ──
  const pgClientId = hexId(8);
  const pgServerId = hexId(8);
  const pgStart = now + ms(130);
  const pgEnd = now + ms(180);
  add("clickshop-api", {
    traceId, spanId: pgClientId, parentSpanId: apiId,
    name: "postgresql.query", kind: 3,
    startNano: pgStart, endNano: pgEnd,
    attrs: { "db.system": "postgresql", "peer.service": "postgresql", "db.statement": "SELECT * FROM orders LIMIT 100" },
    status: 1,
  });
  add("postgresql", {
    traceId, spanId: pgServerId, parentSpanId: pgClientId,
    name: "SELECT orders", kind: 2,
    startNano: pgStart + ms(1), endNano: pgEnd - ms(1),
    attrs: { "db.system": "postgresql", "db.name": "postgres" },
    status: 1,
  });

  // ── clickshop-api → LibreChat-NGINX → LibreChat-API → chat-documentdb/meilisearch/rag ──
  const nginxClientId = hexId(8);
  const nginxServerId = hexId(8);
  const lcApiClientId = hexId(8);
  const lcApiServerId = hexId(8);
  const lcStart = now + ms(200);
  const lcEnd = now + ms(750);
  const agent = ["clickshop-ceo-agent", "clickshop-sales-agent", "clickshop-data-agent"][Math.floor(Math.random() * 3)];

  // clickshop-api → LibreChat-NGINX (client)
  add("clickshop-api", {
    traceId, spanId: nginxClientId, parentSpanId: apiId,
    name: "HTTP POST /api/chat", kind: 3,
    startNano: lcStart, endNano: lcEnd,
    attrs: { "http.method": "POST", "peer.service": "LibreChat-NGINX", "http.url": "/api/chat" },
    status: 1,
  });
  // LibreChat-NGINX (server + proxy to API)
  add("LibreChat-NGINX", {
    traceId, spanId: nginxServerId, parentSpanId: nginxClientId,
    name: "proxy_pass /api/chat", kind: 2,
    startNano: lcStart + ms(2), endNano: lcEnd - ms(2),
    attrs: { "http.method": "POST", "upstream": "librechat:3080" },
    status: 1,
  });
  add("LibreChat-NGINX", {
    traceId, spanId: lcApiClientId, parentSpanId: nginxServerId,
    name: "upstream librechat:3080", kind: 3,
    startNano: lcStart + ms(5), endNano: lcEnd - ms(5),
    attrs: { "peer.service": "LibreChat-API" },
    status: 1,
  });
  // LibreChat-API (server)
  add("LibreChat-API", {
    traceId, spanId: lcApiServerId, parentSpanId: lcApiClientId,
    name: `POST /api/ask/${agent}`, kind: 2,
    startNano: lcStart + ms(8), endNano: lcEnd - ms(10),
    attrs: { "ai.agent": agent, "http.method": "POST" },
    status: 1,
  });

  // LibreChat-API → chat-documentdb
  const mongoClientId = hexId(8);
  const mongoServerId = hexId(8);
  add("LibreChat-API", {
    traceId, spanId: mongoClientId, parentSpanId: lcApiServerId,
    name: "documentdb.findOne conversations", kind: 3,
    startNano: lcStart + ms(15), endNano: lcStart + ms(30),
    attrs: { "db.system": "documentdb", "peer.service": "chat-documentdb", "db.collection": "conversations" },
    status: 1,
  });
  add("chat-documentdb", {
    traceId, spanId: mongoServerId, parentSpanId: mongoClientId,
    name: "findOne conversations", kind: 2,
    startNano: lcStart + ms(16), endNano: lcStart + ms(29),
    attrs: { "db.system": "documentdb", "db.name": "LibreChat", "db.operation": "findOne" },
    status: 1,
  });

  // LibreChat-API → chat-meilisearch
  const meiliClientId = hexId(8);
  const meiliServerId = hexId(8);
  add("LibreChat-API", {
    traceId, spanId: meiliClientId, parentSpanId: lcApiServerId,
    name: "meilisearch.search", kind: 3,
    startNano: lcStart + ms(35), endNano: lcStart + ms(55),
    attrs: { "peer.service": "chat-meilisearch", "http.method": "POST" },
    status: 1,
  });
  add("chat-meilisearch", {
    traceId, spanId: meiliServerId, parentSpanId: meiliClientId,
    name: "POST /indexes/messages/search", kind: 2,
    startNano: lcStart + ms(36), endNano: lcStart + ms(54),
    attrs: { "db.operation": "search", "meilisearch.index": "messages" },
    status: 1,
  });

  // LibreChat-API → librechat-rag-api → librechat-vectordb
  const ragClientId = hexId(8);
  const ragServerId = hexId(8);
  const vdbClientId = hexId(8);
  const vdbServerId = hexId(8);
  add("LibreChat-API", {
    traceId, spanId: ragClientId, parentSpanId: lcApiServerId,
    name: "rag.retrieve", kind: 3,
    startNano: lcStart + ms(60), endNano: lcStart + ms(200),
    attrs: { "peer.service": "librechat-rag-api", "http.method": "POST", "http.url": "/api/retrieve" },
    status: 1,
  });
  add("librechat-rag-api", {
    traceId, spanId: ragServerId, parentSpanId: ragClientId,
    name: "POST /api/retrieve", kind: 2,
    startNano: lcStart + ms(62), endNano: lcStart + ms(198),
    attrs: { "http.method": "POST", "rag.chunks_found": Math.floor(Math.random() * 10 + 1) },
    status: 1,
  });
  add("librechat-rag-api", {
    traceId, spanId: vdbClientId, parentSpanId: ragServerId,
    name: "vectordb.similarity_search", kind: 3,
    startNano: lcStart + ms(70), endNano: lcStart + ms(180),
    attrs: { "db.system": "postgresql", "peer.service": "librechat-vectordb", "db.operation": "similarity_search" },
    status: 1,
  });
  add("librechat-vectordb", {
    traceId, spanId: vdbServerId, parentSpanId: vdbClientId,
    name: "SELECT embeddings <=> $1", kind: 2,
    startNano: lcStart + ms(72), endNano: lcStart + ms(178),
    attrs: { "db.system": "postgresql", "db.name": "mydatabase", "db.rows_returned": 5 },
    status: 1,
  });

  // LibreChat-API → chat-documentdb (message save)
  const csMongo1 = hexId(8);
  const csMongo2 = hexId(8);
  add("LibreChat-API", {
    traceId, spanId: csMongo1, parentSpanId: lcApiServerId,
    name: "documentdb.insertOne messages", kind: 3,
    startNano: lcStart + ms(210), endNano: lcStart + ms(230),
    attrs: { "db.system": "documentdb", "peer.service": "chat-documentdb", "db.collection": "messages", "db.operation": "insertOne" },
    status: 1,
  });
  add("chat-documentdb", {
    traceId, spanId: csMongo2, parentSpanId: csMongo1,
    name: "insertOne messages", kind: 2,
    startNano: lcStart + ms(211), endNano: lcStart + ms(229),
    attrs: { "db.system": "documentdb", "db.name": "LibreChat" },
    status: 1,
  });

  // ── clickshop-api → langfuse ──
  const lfClientId = hexId(8);
  const lfServerId = hexId(8);
  add("clickshop-api", {
    traceId, spanId: lfClientId, parentSpanId: apiId,
    name: "langfuse.ingest", kind: 3,
    startNano: now + ms(760), endNano: now + ms(800),
    attrs: { "peer.service": "langfuse", "http.method": "POST" },
    status: 1,
  });
  add("langfuse", {
    traceId, spanId: lfServerId, parentSpanId: lfClientId,
    name: "POST /api/public/ingestion", kind: 2,
    startNano: now + ms(762), endNano: now + ms(798),
    attrs: { "langfuse.event_type": "trace" },
    status: 1,
  });

  // ── clickshop-api → otel-collector ──
  const ocClientId = hexId(8);
  const ocServerId = hexId(8);
  add("clickshop-api", {
    traceId, spanId: ocClientId, parentSpanId: apiId,
    name: "otel.export", kind: 3,
    startNano: now + ms(810), endNano: now + ms(835),
    attrs: { "peer.service": "otel-collector", "otel.signal": "traces" },
    status: 1,
  });
  add("otel-collector", {
    traceId, spanId: ocServerId, parentSpanId: ocClientId,
    name: "otlp/export traces", kind: 2,
    startNano: now + ms(812), endNano: now + ms(833),
    attrs: { "otel.signal": "traces", "exporter": "clickhouse" },
    status: 1,
  });

  // ── Send to collector ──
  const payload = buildOtlpPayload(spansByService);
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
  try {
    const res = await fetch(`${endpoint}/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[otel] service graph POST failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("[otel] service graph POST error:", err);
  }

  return traceId;
}

export async function traceAsync<T>(name: string, fn: (span: Span) => Promise<T>, attributes?: Record<string, string>): Promise<T> {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, async (span: Span) => {
    try {
      if (attributes) {
        for (const [k, v] of Object.entries(attributes)) span.setAttribute(k, v);
      }
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
