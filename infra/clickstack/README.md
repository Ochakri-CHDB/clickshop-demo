# ClickStack dashboards and alerts

Dashboards and alerts for the ClickShop observability demo. They work with the HyperDX deployed by the chart (`clickstack.mode: oss`) and with Managed ClickStack (`clickstack.mode: cloud`). Telemetry lands in the `otel_*` tables written by the OpenTelemetry collector of the chart.

## Contents

| File | Purpose |
|---|---|
| `dashboard-api-health.json` | API Health: request rate, p50/p95/p99 latency by route, error rate, recent error spans |
| `dashboard-ai-agents.json` | AI Agents: agent runs by persona, chat latency, MCP tool latency, Langfuse ingestion |
| `dashboard-platform-business.json` | Platform & Business Flow: payment webhooks, log volume per service (ingestion health), errors/warnings, pod CPU/memory |
| `alerts.json` | 5 alert definitions with thresholds, intervals, and messages |

All dashboard files follow the ClickStack dashboard template format (`version: 0.1.0`, the same schema as the UI Export/Import feature).

## Import the dashboards

1. Open the ClickStack UI (HyperDX) for the service.
2. Go to Dashboards, create a new dashboard, choose Import.
3. Select one of the JSON files.
4. Map sources when prompted: tiles with source `Traces` to your Traces source, `Logs` to Logs, `Metrics` to Metrics (gauge). The importer asks once per distinct source name.

The tile queries assume the default ClickStack OTel schema (`otel_traces`, `otel_logs`, `otel_metrics_gauge`) and the demo service names: `clickshop-api`, `clickshop-librechat`, `clickshop-frontend`, `clickshop-documentdb`.

## Create the alerts

Alerts are attached to dashboard tiles, so they can only be created after import (tile IDs are reassigned). Two options:

**Option A, UI**: on each tile listed in `alerts.json`, open the tile menu, Create alert, and copy the interval / threshold / message from the JSON.

**Option B, API**: Managed ClickStack exposes the alerts API through the ClickHouse Cloud API (requires an active Cloud API key):

```bash
curl -X POST --user $KEY_ID:$KEY_SECRET \
  -H "Content-Type: application/json" \
  -d '{
    "dashboardId": "<DASHBOARD_ID>",
    "tileId": "<TILE_ID>",
    "source": "tile",
    "interval": "5m",
    "thresholdType": "above",
    "threshold": 2000,
    "channel": { "type": "webhook", "webhookId": "<WEBHOOK_ID>" },
    "name": "ClickShop API p95 latency > 2s",
    "message": "..."
  }' \
  https://api.clickhouse.cloud/v1/organizations/<ORG_ID>/services/<SERVICE_ID>/clickstack/alerts
```

For open source ClickStack the same payload goes to `http://<host>:8000/api/v2/alerts` with `Authorization: Bearer <PERSONAL_API_KEY>`.

Note: the `CHC_API_KEY_ID` / `CHC_API_KEY_SECRET` pair in `.env` returned `UNAUTHORIZED: Key is not active` at the time of writing, so the alerts could not be provisioned programmatically. Create an active Cloud API key or use the UI.

## Alert summary

| Alert | Tile | Condition | Window |
|---|---|---|---|
| API p95 latency > 2s | `api-p95-number` | above 2000 ms | 5m |
| API error spike | `api-error-count` | above 25 error spans | 5m |
| Telemetry ingestion stopped | `plat-log-volume-number` | below 1 log record | 15m |
| Payment webhooks stalled | `plat-payment-webhooks` | below 1 event | 1h |
| AI agent pipeline errors | `agents-pipeline-errors` | above 10 error spans | 15m |

## ClickStack MCP server

ClickStack ships an MCP server (announced at Open House, June 2026). Endpoints:

- Managed ClickStack (this demo): `https://mcp.clickhouse.cloud/clickstack`, OAuth 2.0 only (interactive browser login, no API key support). This cannot be wired into LibreChat headlessly, which is why the SRE agent uses the custom `clickshop-observability` stdio MCP (direct ClickHouse queries on the OTel tables) instead.
- Open source / BYOC: `<instance>/api/mcp` with `Authorization: Bearer <personal API key>` (Streamable HTTP). If the demo ever moves to self-hosted ClickStack, that endpoint can be added to `librechat.yaml` as a `streamable-http` MCP server.
