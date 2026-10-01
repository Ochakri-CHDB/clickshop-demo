import { NextRequest, NextResponse } from "next/server";
import { context, trace, metrics, SpanKind, SpanStatusCode, type Span } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";

// Server-side telemetry wrapper for API route handlers.
// Produces one SERVER span per request with HTTP + user attributes,
// records exceptions as span events, and feeds RED metrics
// (rate / errors / duration) for every instrumented route.

const tracer = trace.getTracer("clickshop-api");
const meter = metrics.getMeter("clickshop-api");
const logger = logs.getLogger("clickshop-api");

const requestCounter = meter.createCounter("clickshop.http.server.requests", {
  description: "API requests handled by route",
});
const errorCounter = meter.createCounter("clickshop.http.server.errors", {
  description: "API requests that returned 5xx or threw",
});
const durationHistogram = meter.createHistogram("clickshop.http.server.duration", {
  description: "API request duration by route",
  unit: "ms",
});

function readUser(req: NextRequest): { id: string; email: string } {
  const id = req.cookies.get("clickshop_user")?.value ?? "anonymous";
  return { id, email: id === "anonymous" ? "" : `${id}@clickshop.io` };
}

export async function withApiSpan(
  route: string,
  req: NextRequest,
  handler: (span: Span) => Promise<NextResponse>,
): Promise<NextResponse> {
  const method = req.method;
  const user = readUser(req);
  const t0 = Date.now();

  return tracer.startActiveSpan(
    `${method} ${route}`,
    {
      kind: SpanKind.SERVER,
      attributes: {
        "http.request.method": method,
        "http.method": method,
        "http.route": route,
        "url.path": req.nextUrl.pathname,
        "url.query": req.nextUrl.search.replace(/^\?/, ""),
        "user_agent.original": req.headers.get("user-agent") ?? "",
        "client.address": req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
        "enduser.id": user.id,
        "user.id": user.id,
        "user.email": user.email,
      },
    },
    async (span: Span) => {
      const metricAttrs = { "http.route": route, "http.method": method };
      try {
        const res = await handler(span);
        const durationMs = Date.now() - t0;
        span.setAttribute("http.response.status_code", res.status);
        span.setAttribute("http.status_code", res.status);
        span.setAttribute("http.server.duration_ms", durationMs);
        span.setStatus({ code: res.status >= 500 ? SpanStatusCode.ERROR : SpanStatusCode.OK });

        requestCounter.add(1, { ...metricAttrs, "http.status_code": String(res.status) });
        durationHistogram.record(durationMs, metricAttrs);
        if (res.status >= 500) errorCounter.add(1, metricAttrs);
        return res;
      } catch (err) {
        const durationMs = Date.now() - t0;
        const error = err as Error;
        span.recordException(error);
        span.setAttribute("http.response.status_code", 500);
        span.setAttribute("http.status_code", 500);
        span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });

        requestCounter.add(1, { ...metricAttrs, "http.status_code": "500" });
        errorCounter.add(1, metricAttrs);
        durationHistogram.record(durationMs, metricAttrs);

        logger.emit({
          severityNumber: SeverityNumber.ERROR,
          severityText: "ERROR",
          body: `Unhandled error in ${method} ${route}: ${error.message}`,
          context: context.active(),
          attributes: {
            "http.route": route,
            "exception.type": error.name,
            "exception.message": error.message,
            "exception.stacktrace": error.stack ?? "",
            "user.id": user.id,
          },
        });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}
