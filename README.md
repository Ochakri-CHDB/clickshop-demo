# ClickShop demo

ClickShop is a retail analytics demo built on ClickHouse. It runs on any Kubernetes cluster with one Helm chart, either fully open source or with some components on ClickHouse Cloud.

## Quick start

With `kubectl` pointing at a cluster (see [Prerequisites](#prerequisites)), and `helm`, `openssl`, `curl` installed:

```bash
curl -fsSL https://raw.githubusercontent.com/Ochakri-CHDB/clickshop-demo/main/install.sh | bash
```

The installer asks two questions, each with a default (press Enter):

1. **Setup**: `oss` runs everything in the cluster, `custom` lets you put ClickHouse, Postgres, Langfuse or ClickStack on a Cloud service.
2. **Anthropic API key**: optional. Empty means the bundled Qwen 2.5 7B model on Ollama.

Only your public IP can reach the demo: the installer detects it and restricts the load balancer to it. Set `CLICKSHOP_SOURCE_RANGES` to allow other ranges.

It downloads the chart of the release, installs it, waits for the demo data and prints the URLs and the generated password. Allow 15 to 25 minutes for a first install (images, the 4.7 GB model and 3M demo rows).

No cluster yet? On AWS, `eksctl create cluster -f deploy/eks/cluster.yaml` (from a checkout) creates one that fits the full open source setup in about 20 minutes.

What the demo shows:

- **Persona dashboards**: CEO, Sales, Data, SRE and AI Engineer workspaces on live ClickHouse data (medallion bronze, silver, gold with refreshable and incremental materialized views).
- **CDC**: Postgres orders replicated into ClickHouse by PeerDB (open source) or ClickPipes (Cloud).
- **AI agents**: LibreChat with 6 persona agents that query ClickHouse and Postgres through MCP servers, plus 6 demo agents built with different frameworks (Anthropic/OpenAI SDK, LangChain, LlamaIndex, AI SDK, Mastra, LangGraph).
- **LLM observability**: every agent run is traced in Langfuse (open source on the same ClickHouse, or Langfuse Cloud).
- **Observability**: traces, logs, metrics and session replays in ClickStack (HyperDX). Full-text search on 1M customer reviews and on logs with ClickHouse text indexes.

## Components and modes

| Component | `oss` (in the cluster) | `cloud` (you provide access) |
|---|---|---|
| ClickHouse | ClickHouse server, one instance shared by the app, Langfuse and OTel | ClickHouse Cloud service (host, user, password) |
| Postgres | Postgres 18 with `wal_level=logical` | Any Postgres URL (ClickHouse managed Postgres, RDS, ...) |
| CDC | PeerDB + Temporal + MinIO staging | ClickPipes Postgres CDC (created in the console) |
| Langfuse | Langfuse v4 web + worker, Valkey, MinIO | Langfuse Cloud keys |
| ClickStack | HyperDX + OpenTelemetry collector | Managed ClickStack OTLP endpoint + key |
| LLM | Ollama with Qwen 2.5 7B | Anthropic API key (Claude) or any OpenAI-compatible endpoint |

Every database stays `ClusterIP`. Only a gateway (nginx) is exposed, through one LoadBalancer restricted to your IP ranges (`gateway.sourceRanges`). The chart refuses to render without source ranges or with `0.0.0.0/0`.

## Versions

Every image is pinned in `deploy/helm/clickshop/values.yaml` (`images.*`). There are no floating tags.

| Component | Version | Note |
|---|---|---|
| ClickHouse | 26.9.6.6 | Langfuse v4 needs 25.12 or later |
| Postgres | 18.6 | PeerDB CI covers 16, 17 and 18 |
| MongoDB | 8.0.32 | 8.0 is the long-term line. 8.1 to 8.3 are rapid releases |
| Valkey | 9.1.2 | |
| MinIO | pgsty/silo RELEASE.2026-09-16 | Maintained MinIO build |
| Langfuse | 4.48.0 (web and worker) | Fresh installs run in `events_only` mode, see below |
| HyperDX (ClickStack) | 2.39.1 | |
| OpenTelemetry collector | contrib 0.161.0 | 0.162.0 had no multi-arch manifest at release time |
| PeerDB | stable-v0.37.10 | |
| Temporal | auto-setup 1.29.7 | Last release with `auto-setup`. 1.30+ needs a separate schema job that PeerDB does not ship |
| LibreChat | v0.8.7 | Base of the custom image |
| Ollama | 0.35.0 | Model `qwen2.5:7b` |
| nginx, curl, busybox | 1.30.5, 8.22.0, 1.38.0 | |
| Web app | Next.js 14.2.35, Node 22.23.3 | Langfuse SDK 5.11, AI SDK 7, Mastra 1.72, LangGraph 1.4, OTel SDK 2.11 |

**Langfuse v4**: a new install writes only to the `events_full` and `events_core` tables in the `langfuse` database. The legacy `traces` and `observations` tables stay empty and the v1 read APIs (`/api/public/traces`, `/observations`, `/metrics`) return 404. The AI Engineer dashboard uses the Metrics API v2 (`/api/public/v2/metrics`), where a trace is a root observation (`isRootObservation = true`). With Langfuse Cloud, the dashboard only counts the environment set in `CLICKSHOP_LANGFUSE_ENV`.

## Prerequisites

- Kubernetes 1.27+ with LoadBalancer support (EKS, AKS, GKE, or any cluster with MetalLB) and a default StorageClass. On EKS without one, the installer creates an encrypted gp3 class when the EBS CSI driver is installed.
- `kubectl`, `helm` 3.14+ (or 4), `openssl`, `curl`. Nothing to build: the images are published on GitHub Container Registry for `linux/amd64` and `linux/arm64`.
- Capacity, requests actually reserved by the chart:

| Mode | CPU requests | Memory requests | Suggested nodes |
|---|---|---|---|
| Full OSS with Ollama | 9.6 vCPU | 20.6 GiB | 2 × 8 vCPU / 32 GiB + 1 × 16 vCPU / 32 GiB for Ollama |
| Full OSS with Anthropic | 3.6 vCPU | 10.6 GiB | 2 × 8 vCPU / 32 GiB |
| ClickHouse and Langfuse on Cloud, Ollama kept | 7.3 vCPU | 13.0 GiB | 1 × 8 vCPU / 32 GiB + 1 × 16 vCPU / 32 GiB |

The local model runs on CPU. A 16 vCPU node gives roughly 8 to 12 tokens per second, so an agent answer takes 20 to 90 seconds.

The local model runs on CPU, so the Ollama pod prefers a node labelled `workload=llm` and tolerates the `workload=llm:NoSchedule` taint (both set by `deploy/eks/cluster.yaml`). Without such a node it runs on any node with 6 free vCPU.

## Install

From GitHub (shown above), or from a checkout:

```bash
git clone https://github.com/Ochakri-CHDB/clickshop-demo && cd clickshop-demo
./install.sh
```

In `custom` setup the script asks the mode of each component and only the credentials those modes need. It then:

1. creates the Secret `clickshop-secrets` (generated passwords and keys are kept on re-runs),
2. writes its choices without secrets to `values.local.yaml` in a checkout, or to `~/.config/clickshop/<namespace>.values.yaml` when piped from curl,
3. runs `helm upgrade --install`, reads the load balancer address, and re-applies with the public URLs,
4. waits for the pods and the init job (schema, demo data, CDC mirror, accounts),
5. prints the URLs, the admin account and the generated password.

Non-interactive install, every prompt has an environment variable:

```bash
curl -fsSL https://raw.githubusercontent.com/Ochakri-CHDB/clickshop-demo/main/install.sh | \
  CLICKSHOP_NONINTERACTIVE=1 CLICKSHOP_SOURCE_RANGES=203.0.113.10/32 ANTHROPIC_API_KEY=sk-ant-... bash
```

Main variables:

| Variable | Default | Purpose |
|---|---|---|
| `CLICKSHOP_PROFILE` | `oss` (`custom` when a component variable is set) | `oss` or `custom` |
| `CLICKSHOP_CLICKHOUSE`, `CLICKSHOP_POSTGRES` | `oss` | `oss` or `cloud` |
| `CLICKSHOP_CDC` | `peerdb` | `peerdb`, `clickpipes` or `none` |
| `CLICKSHOP_LANGFUSE`, `CLICKSHOP_CLICKSTACK` | `oss` | `oss`, `cloud` or `none` |
| `CLICKSHOP_CH_HOST`, `CLICKSHOP_CH_USER`, `CLICKSHOP_CH_PASSWORD`, `CLICKSHOP_CH_DATABASE` | | ClickHouse Cloud access and target database |
| `CLICKSHOP_PG_URL` | | Postgres URL in `cloud` mode |
| `CLICKSHOP_LANGFUSE_BASE_URL`, `CLICKSHOP_LANGFUSE_PUBLIC_KEY`, `CLICKSHOP_LANGFUSE_SECRET_KEY`, `CLICKSHOP_LANGFUSE_ENV` | | Langfuse Cloud project and environment tag |
| `CLICKSHOP_CLICKSTACK_OTLP`, `CLICKSHOP_CLICKSTACK_KEY`, `CLICKSHOP_CLICKSTACK_UI` | | Managed ClickStack |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | empty, `claude-sonnet-5` | Use Claude instead of the local model |
| `CLICKSHOP_KEEP_OLLAMA` | `auto` | `true` keeps Ollama running even with an Anthropic key |
| `CLICKSHOP_SOURCE_RANGES` | your public IP /32 | CIDRs allowed on the load balancer |
| `CLICKSHOP_ADMIN_EMAIL` | `admin@clickshop.io` | Local admin account |
| `CLICKSHOP_ALLOWED_EMAIL_DOMAIN` | empty | Also allow any address of this domain (same password) |
| `CLICKSHOP_PAGE_EVENTS`, `CLICKSHOP_FEEDBACK_ROWS` | `2000000`, `1000000` | Demo data volume |
| `CLICKSHOP_NAMESPACE` | `clickshop` | Target namespace |
| `CLICKSHOP_STORAGE_CLASS` | cluster default | StorageClass of the volumes |
| `CLICKSHOP_VERSION` | the release of the script | Release to install (tag `v<version>`) |
| `CLICKSHOP_IMAGE_REGISTRY`, `CLICKSHOP_IMAGE_TAG` | `ghcr.io/ochakri-chdb`, chart appVersion | Pull the two ClickShop images from a mirror |
| `CLICKSHOP_WEB_IMAGE`, `CLICKSHOP_LIBRECHAT_IMAGE` | empty | Full image references, override registry and tag |

## Accounts

One password is generated by `install.sh` and stored in `clickshop-secrets` (key `demo-password`). It opens:

- the admin account (web app, LibreChat, Langfuse OSS, HyperDX OSS, PeerDB UI),
- the 5 personas `ceo`, `sales`, `data`, `sre`, `ai-engineer` at `@clickshop.io` (web app and LibreChat).

Read it again later:

```bash
kubectl -n clickshop get secret clickshop-secrets -o jsonpath='{.data.demo-password}' | base64 -d
```

## Three typical setups

**Full open source, no key.** Everything runs in the cluster, agents use Qwen 2.5 7B on Ollama. Nothing leaves the cluster.

**Full open source with Claude.** Same, with `ANTHROPIC_API_KEY`. Ollama is not deployed. Agent answers are faster and much better.

**Mixed Cloud.** For example ClickHouse Cloud (dedicated database) and Langfuse Cloud, the rest in the cluster:

```bash
CLICKSHOP_CLICKHOUSE=cloud CLICKSHOP_CH_HOST=abc123.eu-west-1.aws.clickhouse.cloud \
CLICKSHOP_CH_PASSWORD=... CLICKSHOP_CH_DATABASE=clickshop_demo \
CLICKSHOP_LANGFUSE=cloud CLICKSHOP_LANGFUSE_PUBLIC_KEY=pk-lf-... CLICKSHOP_LANGFUSE_SECRET_KEY=sk-lf-... \
CLICKSHOP_LANGFUSE_ENV=clickshop-demo ./install.sh
```

## Honest limits

- **Small local model**: Qwen 2.5 7B on CPU is slow (tens of seconds per answer) and weaker at multi-step tool use. Agents get shorter prompts, fewer MCP tools and no HTML artifacts in this mode. Use an Anthropic key for customer-facing demos.
- **ClickHouse managed agents**: the ClickHouse Cloud console agents and the managed MCP server use OAuth in the browser, so they cannot be embedded in this demo. LibreChat agents use their own MCP servers instead.
- **PeerDB with ClickHouse Cloud**: PeerDB stages data in S3 and ClickHouse reads the staging bucket. The in-cluster MinIO is not reachable from ClickHouse Cloud, so with a Cloud ClickHouse use ClickPipes (Postgres must then be reachable by ClickPipes) or point PeerDB at a real S3 bucket.
- **ClickPipes**: the pipe is created in the ClickHouse Cloud console (source tables listed by `install.sh`). The init job waits for the `public_*` tables, then creates the silver and gold views.
- **Personas are a view, not a permission**: a persona sees only its workspaces in the navbar, but any signed-in account can open any workspace by URL and call the read APIs. SQL runs read-only for everyone.
- **HTTP only**: the gateway serves plain HTTP on the load balancer. Put the optional Ingress (`ingress.*` values) behind a TLS controller for anything beyond a private demo.

## Scale to zero and restart

You can stop the nodes overnight and keep the data: the volumes survive, the pods come back when the nodes return. Volumes are block devices tied to one availability zone (EBS on AWS, zonal disks on GKE and AKS), so plan for it before the first scale down.

**Keep nodes and volumes in one zone.** If a node group spans several zones, the replacement nodes can start in a zone where a volume does not live. The pod using that volume then stays `Pending` with `didn't match PersistentVolume's node affinity`, and every pod that waits for it (Langfuse waits for ClickHouse, HyperDX and LibreChat wait for MongoDB) stays in `Init`. On a demo cluster, the simplest fix is to pin the node groups and the StorageClass to the same zone:

```yaml
# eksctl, for each managed node group
availabilityZones: [eu-central-1c]
```

```yaml
# StorageClass used by the chart
volumeBindingMode: WaitForFirstConsumer
allowedTopologies:
  - matchLabelExpressions:
      - key: topology.kubernetes.io/zone
        values: [eu-central-1c]
```

`allowedTopologies` only applies to new volumes. A volume already created in another zone must be moved: scale the StatefulSet to 0, snapshot the disk, create a disk from the snapshot in the target zone, then bind a static PersistentVolume with the same PVC name.

Scale down and up (EKS example):

```bash
eksctl scale nodegroup --cluster <cluster> --name <general-nodegroup> --nodes 0 --nodes-min 0
eksctl scale nodegroup --cluster <cluster> --name <llm-nodegroup> --nodes 0 --nodes-min 0
# later
eksctl scale nodegroup --cluster <cluster> --name <general-nodegroup> --nodes 2
eksctl scale nodegroup --cluster <cluster> --name <llm-nodegroup> --nodes 1
```

What to expect on restart, about 5 minutes after the nodes are `Ready`:

- **Pod order**: ClickHouse, Postgres and MongoDB start first. Langfuse, HyperDX, LibreChat and PeerDB stay in `Init` until their database answers, then start on their own. No manual action is needed.
- **Ollama**: the model stays on its volume. The init container only checks the manifest (a few seconds) instead of downloading 4.7 GB again.
- **CDC**: the PeerDB mirror resumes from its replication slot. Rows written to Postgres while the cluster was down are replicated once the flow workers are up. The slot holds WAL meanwhile, so do not leave the cluster stopped for weeks with a busy Postgres.
- **Refreshable materialized views**: they resume on their next schedule. The gold views catch up on the first refresh.
- **Load balancer**: the address does not change, the nodes register again in the target group. Allow 1 to 2 minutes for health checks.

## Uninstall

```bash
helm -n clickshop uninstall clickshop
kubectl delete ns clickshop   # also deletes the volumes
```

## Publish a release (maintainers)

A tag publishes everything through `.github/workflows/release.yml`: both images for `linux/amd64` and `linux/arm64` on `ghcr.io/<owner>/clickshop-web` and `clickshop-librechat`, and the chart on `oci://ghcr.io/<owner>/charts/clickshop`. A fork publishes under its own owner.

1. Set the same version in `appVersion` and `version` of `deploy/helm/clickshop/Chart.yaml` and in `CLICKSHOP_VERSION` at the top of `install.sh`.
2. Commit, then `git tag v1.0.0 && git push origin v1.0.0`. The workflow fails if the tag and `appVersion` differ.
3. First release only: GitHub creates the three packages as private. Make each one public (Packages, package, Package settings, Change visibility). The last step of the workflow warns until they are.

To build the images yourself, for a private registry:

```bash
REGISTRY=registry.example.com/clickshop
docker buildx build --platform linux/amd64,linux/arm64 -f apps/web/Dockerfile -t $REGISTRY/clickshop-web:1.0.0 --push .
docker buildx build --platform linux/amd64,linux/arm64 -t $REGISTRY/clickshop-librechat:1.0.0 --push infra/librechat
CLICKSHOP_IMAGE_REGISTRY=$REGISTRY ./install.sh
```

## Repository layout

| Path | Content |
|---|---|
| `apps/web` | Next.js app (dashboards, demo agents, APIs) |
| `infra/librechat` | LibreChat image: persona prompts, MCP servers, account seeding |
| `deploy/helm/clickshop` | Umbrella chart (templates, SQL schema and demo data, init scripts) |
| `deploy/eks/cluster.yaml` | eksctl cluster sized for the full open source setup |
| `install.sh` | Interactive and non-interactive installer, works from a checkout or piped from curl |
| `.github/workflows` | CI (chart lint and render, shellcheck, typecheck) and release |
