/**
 * Startup script: writes /app/librechat.yaml before LibreChat starts.
 *
 * Prompts come from the bundled prompts.json. When Langfuse keys are set, the
 * production-labelled version of each prompt in Langfuse overrides the bundled
 * one, so prompt edits in Langfuse apply on the next LibreChat restart.
 *
 * The LLM endpoint follows LLM_PROVIDER: "anthropic" uses the native Anthropic
 * endpoint, "openai-compatible" (default) declares a custom endpoint pointing
 * at OPENAI_BASE_URL (Ollama in the default OSS install).
 */
import fs from "fs";

const env = process.env;
const PK = env.LANGFUSE_PUBLIC_KEY;
const SK = env.LANGFUSE_SECRET_KEY;
const LF_URL = (env.LANGFUSE_BASE_URL || "").replace(/\/$/, "");
const LF_MODE = env.MODE_LANGFUSE || "oss";

const PROVIDER = env.LLM_PROVIDER || (env.ANTHROPIC_API_KEY ? "anthropic" : "openai-compatible");
const MODEL =
  env.LLM_MODEL ||
  (PROVIDER === "anthropic" ? env.ANTHROPIC_MODEL || "claude-sonnet-5-5" : env.OPENAI_MODEL || "qwen2.5:7b");
const OPENAI_BASE_URL = (env.OPENAI_BASE_URL || "http://ollama:11434/v1").replace(/\/$/, "");
const SMALL_MODEL = PROVIDER !== "anthropic" && env.LLM_SMALL_MODEL !== "false";
const ENDPOINT = PROVIDER === "anthropic" ? "anthropic" : "Ollama";
const MAX_CONTEXT_TOKENS = Number(env.LLM_MAX_CONTEXT_TOKENS || (PROVIDER === "anthropic" ? 150000 : 16000));

const CH_DB = env.CLICKHOUSE_DATABASE || "clickshop";
const CH_SECURE = env.CLICKHOUSE_SECURE || "false";
const CH_PORT = env.CLICKHOUSE_PORT || (CH_SECURE === "true" ? "8443" : "8123");

const bundled = JSON.parse(fs.readFileSync(new URL("./prompts.json", import.meta.url), "utf-8"));

// Each agent attaches only the MCP servers it needs: tool definitions eat the
// context window, which matters a lot for a 16k-token local model.
const MCP_SERVERS = {
  "clickshop-data-agent": ["clickshop-clickhouse", "clickshop-postgres"],
  "clickshop-ceo-agent": ["clickshop-clickhouse", "clickshop-postgres"],
  "clickshop-sales-agent": ["clickshop-clickhouse", "clickshop-postgres"],
  "clickshop-fraud-agent": ["clickshop-clickhouse", "clickshop-postgres"],
  "clickshop-sre-agent": ["clickshop-observability", "clickshop-clickhouse"],
  "clickshop-ai-engineer-agent":
    SMALL_MODEL || LF_MODE === "oss" || !PK ? ["clickshop-clickhouse"] : ["langfuse", "clickshop-clickhouse"],
};
if (SMALL_MODEL) {
  // One MCP server per agent keeps the tool list short for small models.
  MCP_SERVERS["clickshop-sre-agent"] = ["clickshop-observability"];
}

const LANGFUSE_IN_CH =
  LF_MODE === "oss"
    ? " Langfuse v4 stores its data in the ClickHouse database `langfuse`: table events_core has one row per observation (a trace is its root observation), table scores has the judge scores. Query them with clickshop-clickhouse and run DESCRIBE first to get the column names."
    : "";

const MCP_PRIORITY = {
  "clickshop-data-agent": "MCP priority: use clickshop-clickhouse for analytics and clickshop-postgres for transactional lookups.",
  "clickshop-ceo-agent": "MCP priority: use clickshop-clickhouse as your primary tool for all business metrics. Use clickshop-postgres only for specific customer/order lookups.",
  "clickshop-sales-agent": "MCP priority: use clickshop-clickhouse as your primary tool for sales analytics, and clickshop-postgres for customer and order details.",
  "clickshop-fraud-agent": "MCP priority: use clickshop-clickhouse as your primary tool for event analysis and clickshop-postgres for account lookups.",
  "clickshop-sre-agent": "MCP priority: use clickshop-observability as your primary tool (otel_traces, otel_logs, otel_metrics_*).",
  "clickshop-ai-engineer-agent": `MCP priority: use the available MCP tools for traces, generations, scores and costs.${LANGFUSE_IN_CH}`,
};

const SMALL_MODEL_HINT =
  `You run on a small local model. Keep answers short. Call a tool first, then answer from its result. ` +
  `Tables live in the ClickHouse database "${CH_DB}": always write fully qualified names such as ${CH_DB}.order_events. ` +
  `Only produce an artifact when the user explicitly asks for a chart.`;

async function fetchPrompt(name) {
  const auth = Buffer.from(`${PK}:${SK}`).toString("base64");
  const res = await fetch(`${LF_URL}/api/public/v2/prompts/${encodeURIComponent(name)}?label=production`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Langfuse ${res.status}`);
  return res.json();
}

function yamlBlock(text, indent) {
  const pad = " ".repeat(indent);
  return text.split("\n").map((l) => pad + l).join("\n");
}

const q = (s) => JSON.stringify(String(s ?? ""));

function localize(text) {
  return text.replace(/database: clickshop\b/g, `database: ${CH_DB}`).replace(/\bclickshop\.(?=[a-z_]+)/g, `${CH_DB}.`);
}

async function loadPrompts() {
  const prompts = {};
  for (const [name, p] of Object.entries(bundled)) prompts[name] = { ...p };
  if (!PK || !SK || !LF_URL) {
    console.log("[sync-prompts] No Langfuse keys: using bundled prompts");
    return prompts;
  }
  for (const name of Object.keys(prompts)) {
    try {
      const lf = await fetchPrompt(name);
      if (typeof lf.prompt === "string" && lf.prompt.trim()) prompts[name].prompt = lf.prompt;
      if (lf.config?.description) prompts[name].description = lf.config.description;
      console.log(`  langfuse ${name} v${lf.version}`);
    } catch (e) {
      console.log(`  bundled ${name} (${e.message})`);
    }
  }
  return prompts;
}

function spec(name, p) {
  const extra = [MCP_PRIORITY[name], SMALL_MODEL ? SMALL_MODEL_HINT : ""].filter(Boolean).join("\n\n");
  const promptText = localize(extra ? `${p.prompt}\n\n${extra}` : p.prompt);
  return `    - name: ${q(name)}
      label: ${q(p.label)}
      description: ${q(p.description)}${p.default ? "\n      default: true" : ""}
      artifacts: ${SMALL_MODEL ? "false" : "true"}
      mcpServers:
${(MCP_SERVERS[name] || []).map((s) => `        - ${q(s)}`).join("\n")}
      preset:
        endpoint: ${q(ENDPOINT)}
        model: ${q(MODEL)}
        modelLabel: ${q(p.modelLabel)}
        maxContextTokens: ${MAX_CONTEXT_TOKENS}${PROVIDER === "anthropic" ? "\n        thinking: false" : ""}
        greeting: ${q(p.greeting)}
        promptPrefix: |
${yamlBlock(promptText, 10)}
`;
}

function chMcpEnv() {
  return `      CLICKHOUSE_HOST: ${q(env.CLICKHOUSE_HOST || "clickhouse")}
      CLICKHOUSE_PORT: ${q(CH_PORT)}
      CLICKHOUSE_USER: ${q(env.CLICKHOUSE_USER || "default")}
      CLICKHOUSE_PASSWORD: ${q(env.CLICKHOUSE_PASSWORD || "")}
      CLICKHOUSE_DATABASE: ${q(CH_DB)}
      CLICKHOUSE_SECURE: ${q(CH_SECURE)}
      CLICKHOUSE_VERIFY: ${q(env.CLICKHOUSE_VERIFY || "true")}
      CLICKHOUSE_CONNECT_TIMEOUT: "30"
      CLICKHOUSE_SEND_RECEIVE_TIMEOUT: "300"`;
}

function endpoints() {
  if (PROVIDER === "anthropic") return "";
  return `endpoints:
  custom:
    - name: "Ollama"
      apiKey: "\${LLM_OPENAI_API_KEY}"
      baseURL: ${q(`${OPENAI_BASE_URL}/`)}
      models:
        default: [${q(MODEL)}]
        fetch: false
      titleConvo: false
      summarize: false
      forcePrompt: false
      modelDisplayLabel: ${q(env.LLM_LABEL || MODEL)}
`;
}

async function main() {
  const prompts = await loadPrompts();
  const langfuseMcp =
    PK && SK && LF_URL
      ? `
  langfuse:
    type: streamable-http
    url: ${q(`${LF_URL}/api/public/mcp`)}
    requiresOAuth: false
    headers:
      Authorization: "Basic ${Buffer.from(`${PK}:${SK}`).toString("base64")}"
    timeout: 60000
    initTimeout: 15000
    serverInstructions: |
      Langfuse MCP for LLM observability of the ClickShop agents.
`
      : "";

  const yaml = `# Generated at startup by sync-prompts.mjs
version: 1.2.1
cache: true

interface:
  defaultTheme: "dark"
  customWelcome: "Hello! Pick an agent and ask anything about ClickShop's live data."

${endpoints()}
modelSpecs:
  enforce: true
  prioritize: true
  list:
${Object.entries(prompts).map(([n, p]) => spec(n, p)).join("")}
mcpServers:
  clickshop-postgres:
    type: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-postgres"
      - ${q(env.POSTGRES_URL || "")}
    timeout: 60000
    initTimeout: 60000
    serverInstructions: |
      PostgreSQL MCP for ClickShop transactional data.
      Tables: customers, products, orders, order_items, payment_status_current, sales_rep_accounts, vip_customer_flags.

  clickshop-clickhouse:
    type: stdio
    command: /opt/mcp-ch/bin/python
    args:
      - "/opt/mcp-ch/clickhouse_mcp.py"
    env:
${chMcpEnv()}
    timeout: 300000
    initTimeout: 120000
    serverInstructions: |
      ClickHouse MCP for ClickShop analytics data (database: ${CH_DB}).

  clickshop-observability:
    type: stdio
    command: /opt/mcp-ch/bin/python
    args:
      - "/opt/mcp-ch/clickhouse_mcp.py"
    env:
${chMcpEnv()}
    timeout: 300000
    initTimeout: 120000
    serverInstructions: |
      ClickHouse MCP for ClickStack observability data (database: ${CH_DB}).
      OpenTelemetry tables: otel_traces (ServiceName, SpanName, Duration in ns, StatusCode),
      otel_logs (SeverityText, Body, ServiceName), otel_metrics_gauge / otel_metrics_sum /
      otel_metrics_histogram, hyperdx_sessions (browser session replay).
${langfuseMcp}`;

  fs.writeFileSync(env.CONFIG_PATH || "/app/librechat.yaml", yaml, "utf-8");
  console.log(`[sync-prompts] Wrote /app/librechat.yaml (provider=${PROVIDER}, model=${MODEL}, db=${CH_DB})`);
}

main().catch((e) => {
  console.error("[sync-prompts] Error:", e.message);
  process.exit(1);
});
