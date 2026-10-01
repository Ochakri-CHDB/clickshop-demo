import { NextRequest, NextResponse } from "next/server";
import { recordLangfuseEvent, runLangfuseObservation } from "@/lib/langfuse-observations";
import { requireSession } from "@/lib/api-guard";

export const dynamic = "force-dynamic";

const LIBRECHAT_BASE_URL =
  process.env.LIBRECHAT_INTERNAL_URL ||
  process.env.LIBRECHAT_BASE_URL ||
  "http://localhost:4243";

function trimValue(input: string, max = 120): string {
  return input.length > max ? `${input.slice(0, max - 3)}...` : input;
}

function inferInteractionSource(req: NextRequest): { source: string; refererPath: string; traceName: string } {
  const sourceFromQuery = req.nextUrl.searchParams.get("source");
  const referer = req.headers.get("referer") ?? "";
  let refererPath = "";
  if (referer) {
    try {
      refererPath = new URL(referer).pathname;
    } catch {
      refererPath = "";
    }
  }

  const source =
    sourceFromQuery ??
    (refererPath.startsWith("/copilot")
      ? "copilot-page"
      : refererPath.startsWith("/workspace/ceo")
        ? "workspace-ceo"
        : refererPath.startsWith("/workspace/sales")
          ? "workspace-sales"
          : refererPath.startsWith("/workspace/data")
            ? "workspace-data"
            : refererPath.startsWith("/c/") || refererPath === "/auto-login.html"
              ? "librechat-iframe"
              : "unknown");

  return {
    source,
    refererPath,
    traceName: trimValue(`clickshop-ai-${source}`, 200),
  };
}

function buildTargetUrl(req: NextRequest, pathSegments: string[]): string {
  const path = pathSegments.join("/");
  const target = new URL(`/api/ask/${path}`, LIBRECHAT_BASE_URL);
  const src = new URL(req.url);
  src.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  return target.toString();
}

function buildForwardHeaders(req: NextRequest): Headers {
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (
      lower === "host" ||
      lower === "connection" ||
      lower === "content-length" ||
      lower === "accept-encoding"
    ) {
      return;
    }
    headers.set(key, value);
  });
  return headers;
}

async function proxyAsk(
  req: NextRequest,
  pathSegments: string[] | undefined,
  method: string,
): Promise<NextResponse> {
  const unauthorized = await requireSession();
  if (unauthorized) return unauthorized;

  const askPath = pathSegments ?? [];
  const agentSlug = askPath[0] ?? "unknown-agent";
  const targetUrl = buildTargetUrl(req, askPath);
  const sessionCookie = req.cookies.get("connect.sid")?.value;
  const { source, refererPath, traceName } = inferInteractionSource(req);

  return runLangfuseObservation(
    {
      name: "librechat.agent.interaction",
      asType: "agent",
      traceName,
      userId: req.headers.get("x-user-id") ?? undefined,
      sessionId: sessionCookie ? `librechat-${sessionCookie.slice(0, 60)}` : undefined,
      input: {
        method,
        agentSlug,
        path: askPath.join("/"),
        contentType: req.headers.get("content-type") ?? "",
        source,
      },
      metadata: {
        source: "next-proxy",
        interactionSource: source,
        refererPath,
        librechatUrl: LIBRECHAT_BASE_URL,
      },
    },
    async (agentObservation) => {
      const upstreamResponse = await runLangfuseObservation(
        {
          name: "librechat.agent.upstream-call",
          asType: "tool",
          traceName,
          input: { method, targetUrl, agentSlug },
          metadata: { upstream: "librechat", interactionSource: source },
        },
        async () => {
          const init: RequestInit & { duplex?: "half" } = {
            method,
            headers: buildForwardHeaders(req),
            body: method === "GET" || method === "HEAD" ? undefined : req.body,
            cache: "no-store",
          };
          if (method !== "GET" && method !== "HEAD") {
            init.duplex = "half";
          }
          return fetch(targetUrl, init);
        },
      );

      agentObservation?.update({
        output: {
          status: upstreamResponse.status,
          ok: upstreamResponse.ok,
          agentSlug,
        },
      });

      // Mark the interaction as a generation call while preserving streaming body pass-through.
      await runLangfuseObservation(
        {
          name: "librechat.agent.response",
          asType: "generation",
          traceName,
          metadata: {
            agentSlug,
            status: upstreamResponse.status,
            interactionSource: source,
          },
        },
        async () => undefined,
      );

      if (!upstreamResponse.ok) {
        await recordLangfuseEvent(
          "librechat.agent.error",
          {
            agentSlug,
            status: upstreamResponse.status,
            interactionSource: source,
          },
          traceName,
        );
      }

      const passHeaders = new Headers(upstreamResponse.headers);
      passHeaders.delete("content-encoding");
      passHeaders.delete("content-length");
      passHeaders.delete("connection");
      return new NextResponse(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers: passHeaders,
      });
    },
  );
}

export async function POST(
  req: NextRequest,
  context: { params: { path?: string[] } },
): Promise<NextResponse> {
  return proxyAsk(req, context.params.path, "POST");
}

export async function GET(
  req: NextRequest,
  context: { params: { path?: string[] } },
): Promise<NextResponse> {
  return proxyAsk(req, context.params.path, "GET");
}

export async function PUT(
  req: NextRequest,
  context: { params: { path?: string[] } },
): Promise<NextResponse> {
  return proxyAsk(req, context.params.path, "PUT");
}

export async function PATCH(
  req: NextRequest,
  context: { params: { path?: string[] } },
): Promise<NextResponse> {
  return proxyAsk(req, context.params.path, "PATCH");
}

export async function DELETE(
  req: NextRequest,
  context: { params: { path?: string[] } },
): Promise<NextResponse> {
  return proxyAsk(req, context.params.path, "DELETE");
}
