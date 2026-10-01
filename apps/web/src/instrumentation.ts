export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const hasLangfuseConfig = Boolean(
      process.env.LANGFUSE_PUBLIC_KEY &&
        process.env.LANGFUSE_SECRET_KEY &&
        process.env.LANGFUSE_BASE_URL,
    );

    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");
    const { OTLPMetricExporter } = await import("@opentelemetry/exporter-metrics-otlp-http");
    const { OTLPLogExporter } = await import("@opentelemetry/exporter-logs-otlp-http");
    const { PeriodicExportingMetricReader } = await import("@opentelemetry/sdk-metrics");
    const { BatchLogRecordProcessor } = await import("@opentelemetry/sdk-logs");
    const { resourceFromAttributes } = await import("@opentelemetry/resources");
    const { ATTR_SERVICE_NAME } = await import("@opentelemetry/semantic-conventions");
    const { HttpInstrumentation } = await import("@opentelemetry/instrumentation-http");
    const { UndiciInstrumentation } = await import("@opentelemetry/instrumentation-undici");
    const { SpanStatusCode } = await import("@opentelemetry/api");
    const sdkTrace = await import("@opentelemetry/sdk-trace-node");

    const collectorUrl = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

    const gitSha =
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
      "";
    const resourceAttrs: Record<string, string> = {
      [ATTR_SERVICE_NAME]: "clickshop-api",
      "service.namespace": "clickshop",
      "service.version": gitSha ? gitSha.slice(0, 12) : "dev",
      "deployment.environment": process.env.DEPLOYMENT_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    };
    if (process.env.VERCEL === "1") {
      resourceAttrs["cloud.provider"] = "vercel";
      if (process.env.VERCEL_REGION) resourceAttrs["cloud.region"] = process.env.VERCEL_REGION;
      if (process.env.VERCEL_DEPLOYMENT_ID) resourceAttrs["vercel.deployment_id"] = process.env.VERCEL_DEPLOYMENT_ID;
      if (process.env.VERCEL_URL) resourceAttrs["vercel.url"] = process.env.VERCEL_URL;
    }
    const resource = resourceFromAttributes(resourceAttrs);

    const traceExporter = new OTLPTraceExporter({ url: `${collectorUrl}/v1/traces` });
    const statusFixProcessor = new sdkTrace.SimpleSpanProcessor(traceExporter);
    const origOnEnd = statusFixProcessor.onEnd.bind(statusFixProcessor);
    statusFixProcessor.onEnd = (span) => {
      const writable = span as unknown as { status: { code: number } };
      if (writable.status?.code === SpanStatusCode.UNSET) {
        writable.status = { code: SpanStatusCode.OK };
      }
      origOnEnd(span);
    };
    const spanProcessors: any[] = [statusFixProcessor];

    if (hasLangfuseConfig) {
      const { LangfuseSpanProcessor } = await import("@langfuse/otel");
      spanProcessors.push(
        new LangfuseSpanProcessor({
          publicKey: process.env.LANGFUSE_PUBLIC_KEY,
          secretKey: process.env.LANGFUSE_SECRET_KEY,
          baseUrl: process.env.LANGFUSE_BASE_URL,
          exportMode: "immediate",
        }),
      );
    }

    const sdk = new NodeSDK({
      resource,
      spanProcessors,
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${collectorUrl}/v1/metrics`,
        }),
        exportIntervalMillis: 10_000,
      }),
      logRecordProcessor: new BatchLogRecordProcessor({
        exporter: new OTLPLogExporter({
          url: `${collectorUrl}/v1/logs`,
        }),
      }),
      instrumentations: [
        new HttpInstrumentation(),
        // Outbound fetch() on the Node runtime goes through undici: this
        // captures calls to ClickHouse Cloud, Anthropic, LibreChat, Langfuse
        // as CLIENT spans (server.address feeds the ClickStack service map).
        new UndiciInstrumentation(),
      ],
    });

    sdk.start();
    console.log("[OTel] SDK initialized → collector at", collectorUrl);
    if (hasLangfuseConfig) {
      console.log("[Langfuse] OTel span processor enabled");
    }
  }
}
