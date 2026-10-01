import { NextRequest, NextResponse } from "next/server";
import { findAgentMeta, getAgentsForPersona, runDemoAgent } from "@/lib/demo-agents";
import { requireSession } from "@/lib/api-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET ?persona=ceo|sales|data|sre|ai → registry of playground agents for
 * that persona (admin / no persona → the 6 generic agents).
 */
export async function GET(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const persona = req.nextUrl.searchParams.get("persona");
  return NextResponse.json({ agents: getAgentsForPersona(persona) });
}

/** POST {agentId, prompt} → run one playground agent, fully traced in Langfuse. */
export async function POST(req: NextRequest) {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  let body: { agentId?: string; prompt?: string; userId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const agentId = String(body.agentId ?? "");
  const prompt = String(body.prompt ?? "").trim();
  if (!findAgentMeta(agentId)) {
    return NextResponse.json({ error: `Unknown agentId: ${agentId}` }, { status: 400 });
  }
  if (!prompt || prompt.length > 2000) {
    return NextResponse.json({ error: "Prompt must be 1-2000 characters" }, { status: 400 });
  }

  try {
    const result = await runDemoAgent({
      agentId,
      prompt,
      userId: body.userId ? String(body.userId).slice(0, 100) : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
