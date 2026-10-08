/**
 * Build-time patch: readable Langfuse trace names for LibreChat.
 *
 * Problem: @librechat/agents names traces "LibreChat Agent: <agentName>",
 * and for modelSpec presets (ephemeral agents) agentName is the encoded id
 * "anthropic__claude-sonnet-5-5___AI Engineer Agent", which is unreadable in
 * the Langfuse trace list.
 *
 * This script rewrites getLangfuseTraceName in the compiled CJS bundle to
 * emit "librechat.<slug>" instead:
 *   - "anthropic__claude-sonnet-5-5___AI Engineer Agent" -> librechat.ai-engineer-agent
 *   - "ClickShop CEO Agent" (MongoDB agents)            -> librechat.ceo-agent
 *   - no agent name                                     -> librechat.chat
 */
import fs from "fs";

const FILE = "/app/node_modules/@librechat/agents/dist/cjs/langfuse.cjs";

// Matches the compiled function body regardless of exact whitespace.
const ANCHOR =
  /function getLangfuseTraceName\(traceMetadata, fallback = "LibreChat Agent"\) \{[\s\S]*?\n\}/;

const PATCHED = `function getLangfuseTraceName(traceMetadata, fallback = "LibreChat Agent") {
  const agentName = traceMetadata?.agentName;
  if (!require_misc.isPresent(agentName)) return fallback === "LibreChat Title" ? "librechat.title-generation" : "librechat.chat";
  let n = String(agentName);
  // Ephemeral agent ids encode "endpoint__model___sender"; keep the sender label.
  if (n.includes("___")) { const parts = n.split("___"); n = parts[parts.length - 1]; }
  n = n.toLowerCase().replace(/^clickshop[\\s_-]+/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return "librechat." + (n || "chat");
}`;

const src = fs.readFileSync(FILE, "utf8");
if (src.includes('return "librechat." + (n || "chat");')) {
  console.log("[patch-trace-names] Already patched, skipping");
  process.exit(0);
}
if (!ANCHOR.test(src)) {
  console.error("[patch-trace-names] FATAL: anchor not found in " + FILE + " (upstream changed?)");
  process.exit(1);
}
fs.writeFileSync(FILE, src.replace(ANCHOR, PATCHED), "utf8");
console.log("[patch-trace-names] Patched getLangfuseTraceName in " + FILE);
