import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

type GateThresholds = {
  business_accuracy: number;
  actionability: number;
  safety_hallucination: number;
  readability_quality: number;
  completeness_coverage: number;
  evidence_groundedness: number;
  persona_alignment: number;
  requires_human_followup: number;
  overall_quality_score: number;
};

type GateMode = "realistic" | "strict";
type GateStatus = "GO" | "REVIEW" | "NO-GO";

const THRESHOLDS: Record<GateMode, GateThresholds> = {
  realistic: {
    business_accuracy: 0.85,
    actionability: 0.55,
    safety_hallucination: 1,
    readability_quality: 0.8,
    completeness_coverage: 0.75,
    evidence_groundedness: 0.45,
    persona_alignment: 0.45,
    requires_human_followup: 0,
    overall_quality_score: 0.7,
  },
  strict: {
    business_accuracy: 0.92,
    actionability: 0.75,
    safety_hallucination: 1,
    readability_quality: 0.9,
    completeness_coverage: 0.85,
    evidence_groundedness: 0.65,
    persona_alignment: 0.65,
    requires_human_followup: 0,
    overall_quality_score: 0.82,
  },
};

const SCORE_NAMES = [
  "business_accuracy",
  "actionability",
  "safety_hallucination",
  "readability_quality",
  "completeness_coverage",
  "evidence_groundedness",
  "persona_alignment",
  "requires_human_followup",
  "overall_quality_score",
] as const;

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function runSeedBatch(): void {
  const command = process.execPath;
  const args = ["./node_modules/.bin/tsx", "scripts/langfuse-seed-demo-eval.ts"];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error("Failed to run scripts/langfuse-seed-demo-eval.ts");
  }
}

async function fetchScoreAverages(hours = 24): Promise<Record<string, number>> {
  const host = process.env.LANGFUSE_HOST ?? process.env.LANGFUSE_BASE_URL;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!host || !publicKey || !secretKey) {
    throw new Error("Missing Langfuse credentials in environment");
  }

  const auth = `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`;
  const toTimestamp = new Date().toISOString();
  const fromTimestamp = new Date(Date.now() - hours * 3600_000).toISOString();

  const query = {
    view: "scores-numeric",
    metrics: [{ measure: "value", aggregation: "avg" }],
    dimensions: [{ field: "name" }],
    filters: [],
    fromTimestamp,
    toTimestamp,
    rowLimit: 100,
  };

  const url = `${host}/api/public/v2/metrics?query=${encodeURIComponent(JSON.stringify(query))}`;
  const res = await fetch(url, {
    headers: {
      authorization: auth,
      "content-type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Langfuse metrics request failed (${res.status}): ${text}`);
  }

  const body = (await res.json()) as {
    data?: Array<{ name?: string; avg_value?: number | string }>;
  };
  const averages: Record<string, number> = {};
  for (const row of body.data ?? []) {
    const key = row.name;
    if (!key) continue;
    const val = typeof row.avg_value === "string" ? Number(row.avg_value) : row.avg_value;
    if (typeof val === "number" && Number.isFinite(val)) {
      averages[key] = val;
    }
  }
  return averages;
}

function evaluateGate(mode: GateMode, scores: Record<string, number>): {
  mode: GateMode;
  status: GateStatus;
  failures: string[];
  warnings: string[];
} {
  const t = THRESHOLDS[mode];
  const failures: string[] = [];
  const warnings: string[] = [];

  const critical = new Set(["business_accuracy", "safety_hallucination", "requires_human_followup"]);
  const reviewOnly = new Set(["actionability", "persona_alignment"]);

  for (const key of SCORE_NAMES) {
    const score = scores[key];
    const threshold = t[key];
    if (typeof score !== "number") {
      warnings.push(`${key}: missing`);
      continue;
    }

    const passes =
      key === "requires_human_followup"
        ? score <= threshold
        : key === "safety_hallucination"
          ? score >= threshold
          : score >= threshold;

    if (!passes) {
      if (critical.has(key)) {
        failures.push(`${key}=${score.toFixed(3)} < required ${threshold}`);
      } else if (reviewOnly.has(key)) {
        warnings.push(`${key}=${score.toFixed(3)} < target ${threshold}`);
      } else {
        failures.push(`${key}=${score.toFixed(3)} < required ${threshold}`);
      }
    }
  }

  if (failures.length > 0) return { mode, status: "NO-GO", failures, warnings };
  if (warnings.length > 0) return { mode, status: "REVIEW", failures, warnings };
  return { mode, status: "GO", failures, warnings };
}

async function main(): Promise<void> {
  loadEnvFile(path.resolve(process.cwd(), "apps/web/.env"));
  if (!process.env.LANGFUSE_HOST && process.env.LANGFUSE_BASE_URL) {
    process.env.LANGFUSE_HOST = process.env.LANGFUSE_BASE_URL;
  }

  console.log("Step 1/2: Seeding fresh ClickShop traces + scores in Langfuse...");
  runSeedBatch();

  console.log("Step 2/2: Computing gate status from Langfuse metrics...");
  const averages = await fetchScoreAverages(24);
  const realistic = evaluateGate("realistic", averages);
  const strict = evaluateGate("strict", averages);

  console.log(
    JSON.stringify(
      {
        ok: true,
        refreshedAt: new Date().toISOString(),
        trackedScores: Object.fromEntries(
          SCORE_NAMES.map((k) => [k, averages[k] ?? null]),
        ),
        gates: [realistic, strict],
      },
      null,
      2,
    ),
  );
}

void main().catch((err) => {
  console.error("[langfuse-dashboard-refresh] failed:", err);
  process.exitCode = 1;
});
