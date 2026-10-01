// Pushes the bundled persona prompts to Langfuse (label "production") when
// the prompt does not exist yet. Existing prompts are left untouched so edits
// made in the Langfuse UI survive re-installs.
import fs from "fs";

const base = (process.env.LANGFUSE_BASE_URL || "").replace(/\/$/, "");
const pk = process.env.LANGFUSE_PUBLIC_KEY;
const sk = process.env.LANGFUSE_SECRET_KEY;

if (!base || !pk || !sk) {
  console.log("[seed-langfuse] Langfuse not configured, skipping");
  process.exit(0);
}

const auth = "Basic " + Buffer.from(`${pk}:${sk}`).toString("base64");
const personaPrompts = JSON.parse(fs.readFileSync(new URL("./prompts.json", import.meta.url), "utf-8"));
const appPrompts = JSON.parse(fs.readFileSync(new URL("./app-prompts.json", import.meta.url), "utf-8"));

async function waitReady() {
  for (let i = 1; i <= 60; i++) {
    try {
      const res = await fetch(`${base}/api/public/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch {}
    console.log(`[seed-langfuse] waiting for ${base} (${i})`);
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw new Error("Langfuse not reachable");
}

const prompts = [
  ...Object.entries(personaPrompts).map(([name, p]) => [
    name,
    { prompt: p.prompt, tags: ["clickshop", "librechat"], config: { description: p.description, greeting: p.greeting } },
  ]),
  ...Object.entries(appPrompts).map(([name, p]) => [name, { prompt: p.prompt, tags: ["clickshop", "app"], config: p.config }]),
];

await waitReady();
for (const [name, p] of prompts) {
  const existing = await fetch(`${base}/api/public/v2/prompts/${encodeURIComponent(name)}`, { headers: { Authorization: auth } });
  if (existing.ok) {
    console.log(`[seed-langfuse] ${name} exists, kept`);
    continue;
  }
  const res = await fetch(`${base}/api/public/v2/prompts`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      type: "text",
      prompt: p.prompt,
      labels: ["production"],
      tags: p.tags,
      config: p.config,
    }),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  console.log(`[seed-langfuse] ${name} created`);
}
