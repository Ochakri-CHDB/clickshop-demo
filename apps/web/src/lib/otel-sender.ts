import { sendTestTrace, sendTestLog, sendTestMetrics, sendServiceGraphTrace } from "./otel";

// The sender loop lives in the browser (see lib/otel-client-state.ts).
// This module only emits a single batch per call: a server-side setInterval
// would be killed on Vercel serverless once the request completes.

const DEMO_PERSONAS = [
  { userId: "ceo",   email: "ceo@clickshop.io" },
  { userId: "sales", email: "sales@clickshop.io" },
  { userId: "data",  email: "data@clickshop.io" },
  { userId: "admin", email: "admin@clickshop.io" },
];

let batchIndex = 0;

function pickPersona() {
  const p = DEMO_PERSONAS[batchIndex % DEMO_PERSONAS.length];
  batchIndex++;
  // Rotate the session id every minute so replay sessions stay demo-fresh.
  return { ...p, sessionId: `s-${p.userId}-${Math.floor(Date.now() / 60000)}` };
}

function hexId(bytes: number): string {
  const arr = new Uint8Array(bytes);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < bytes; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sendSessionReplayEvent(persona: { userId: string; email: string; sessionId: string }) {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";
  const now = BigInt(Date.now()) * 1_000_000n;

  const pages = ["/workspace/ceo", "/workspace/sales", "/workspace/data", "/copilot", "/"];
  const page = pages[Math.floor(Math.random() * pages.length)];

  const rrwebEvents = [
    { type: 4, data: { href: `${process.env.APP_PUBLIC_URL ?? "http://clickshop.local"}${page}`, width: 1920, height: 1080 }, timestamp: Date.now() - 2000 },
    { type: 2, data: { node: { type: 0, childNodes: [] } }, timestamp: Date.now() - 1500 },
    { type: 3, data: { source: 1, positions: [{ x: Math.floor(Math.random() * 1200 + 100), y: Math.floor(Math.random() * 600 + 100), id: 1, timeOffset: 0 }] }, timestamp: Date.now() - 1000 },
    { type: 3, data: { source: 2, type: 1, id: Math.floor(Math.random() * 50 + 1), x: Math.floor(Math.random() * 1200 + 100), y: Math.floor(Math.random() * 600 + 100) }, timestamp: Date.now() - 500 },
    { type: 3, data: { source: 5, text: "Run Agent", id: Math.floor(Math.random() * 30 + 1) }, timestamp: Date.now() },
  ];

  const payload = {
    resourceLogs: [{
      resource: {
        attributes: [
          { key: "service.name", value: { stringValue: "clickshop-frontend" } },
          { key: "service.namespace", value: { stringValue: "clickshop" } },
          { key: "user.id", value: { stringValue: persona.userId } },
          { key: "user.email", value: { stringValue: persona.email } },
          { key: "rum.sessionId", value: { stringValue: persona.sessionId } },
        ],
      },
      scopeLogs: [{
        scope: { name: "rum.rr-web" },
        logRecords: rrwebEvents.map((evt) => ({
          timeUnixNano: (BigInt(evt.timestamp) * 1_000_000n).toString(),
          observedTimeUnixNano: now.toString(),
          severityNumber: 9,
          severityText: "INFO",
          body: { stringValue: JSON.stringify(evt) },
          attributes: [
            { key: "rum.sessionId", value: { stringValue: persona.sessionId } },
            { key: "user.id", value: { stringValue: persona.userId } },
            { key: "user.email", value: { stringValue: persona.email } },
            { key: "page.url", value: { stringValue: `${process.env.APP_PUBLIC_URL ?? "http://clickshop.local"}${page}` } },
          ],
          traceId: hexId(16),
          spanId: hexId(8),
        })),
      }],
    }],
  };

  try {
    await fetch(`${endpoint}/v1/logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // silently fail
  }
}

export interface OtelBatchResult {
  traces: number;
  logs: number;
  metrics: number;
  sessions: number;
  error: string | null;
}

export async function emitOtelBatch(): Promise<OtelBatchResult> {
  const result: OtelBatchResult = { traces: 0, logs: 0, metrics: 0, sessions: 0, error: null };
  try {
    const pages = ["homepage", "ceo-workspace", "sales-workspace", "data-workspace", "diagnostics", "agents"];
    const methods = ["GET", "POST", "PUT"];
    const routes = ["/api/analytics/ceo", "/api/analytics/sales", "/api/health", "/api/transactions", "/api/sql/execute", "/api/generate"];
    const logMessages = [
      "User navigated to dashboard",
      "Query executed on ClickHouse",
      "Transaction search performed",
      "AI recommendation requested",
      "Data generator status polled",
      "WebSocket connection established",
      "Cache miss — fetching from database",
      "Slow query detected (>500ms)",
      "New user session started",
      "Payment webhook received",
    ];
    const severities: Array<"info" | "warn" | "error"> = ["info", "info", "info", "info", "warn", "error"];

    const persona = pickPersona();

    sendTestTrace({
      "http.method": methods[Math.floor(Math.random() * methods.length)],
      "http.route": routes[Math.floor(Math.random() * routes.length)],
      "http.status_code": String(Math.random() > 0.1 ? 200 : 500),
      "page": pages[Math.floor(Math.random() * pages.length)],
      "user.id": persona.userId,
      "user.email": persona.email,
      "session.id": persona.sessionId,
    });
    result.traces++;

    const sev = severities[Math.floor(Math.random() * severities.length)];
    const msg = logMessages[Math.floor(Math.random() * logMessages.length)];
    sendTestLog(`${msg} [user=${persona.userId}] [session=${persona.sessionId}]`, sev);
    result.logs++;

    sendTestMetrics();
    result.metrics += 3;

    // Await the raw OTLP posts: on serverless the function is frozen right
    // after the response, so fire-and-forget sends would be dropped.
    await sendServiceGraphTrace();
    result.traces++;

    await sendSessionReplayEvent(persona);
    result.sessions++;
  } catch (err) {
    result.error = (err as Error).message;
  }
  return result;
}
