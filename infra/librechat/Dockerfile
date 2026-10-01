ARG LIBRECHAT_IMAGE=ghcr.io/danny-avila/librechat:v0.8.7
FROM ${LIBRECHAT_IMAGE}

USER root

RUN apk add --no-cache gcc musl-dev python3-dev linux-headers

# Lightweight ClickHouse MCP server (stdio), without chdb which needs glibc.
RUN uv venv /opt/mcp-ch && \
    . /opt/mcp-ch/bin/activate && \
    uv pip install clickhouse-connect==1.9.0 "mcp[cli]==1.30.0" && \
    chown -R node:node /opt/mcp-ch
COPY clickhouse_mcp.py /opt/mcp-ch/clickhouse_mcp.py

# Pre-install the Postgres MCP so agents do not download it on first use.
RUN npm install -g @modelcontextprotocol/server-postgres@0.6.2

RUN cd /app/api && npm install langfuse@3.39.2 @langfuse/tracing@5.11.1 @langfuse/otel@5.11.1 @langfuse/client@5.11.1 @opentelemetry/sdk-node@0.222.0

# Readable Langfuse trace names (librechat.<agent-slug>), see patch-trace-names.mjs.
COPY patch-trace-names.mjs /app/patch-trace-names.mjs
RUN sed -i "s/runName: 'AgentRun',//" \
      /app/api/server/controllers/agents/client.js \
      /app/api/server/controllers/agents/responses.js \
      /app/api/server/controllers/agents/openai.js && \
    sed -i 's/runName: "AgentRun",//' /app/packages/api/dist/index.cjs && \
    sed -i "s/runName: 'TitleRun',/runName: 'librechat.title-generation',/" \
      /app/api/server/controllers/agents/client.js && \
    node /app/patch-trace-names.mjs

COPY prompts.json app-prompts.json sync-prompts.mjs seed-users.cjs seed-langfuse.mjs seed-hyperdx.mjs entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh && touch /app/librechat.yaml && \
    chown -R node:node /app/client/dist /app/librechat.yaml /app/prompts.json

USER node
ENTRYPOINT ["/app/entrypoint.sh"]
