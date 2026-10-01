#!/usr/bin/env bash
# ClickShop demo installer.
#
# From GitHub, nothing to clone:
#   curl -fsSL https://raw.githubusercontent.com/Ochakri-CHDB/clickshop-demo/main/install.sh | bash
# From a checkout:
#   ./install.sh
# Non-interactive:
#   CLICKSHOP_NONINTERACTIVE=1 ANTHROPIC_API_KEY=... ./install.sh
#
# Every prompt has an environment variable. Generated credentials are stored
# in the Kubernetes Secret "clickshop-secrets" and reused on re-runs.
set -euo pipefail

CLICKSHOP_VERSION=${CLICKSHOP_VERSION:-1.0.0}
CLICKSHOP_REPO=${CLICKSHOP_REPO:-Ochakri-CHDB/clickshop-demo}

log() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# Piped from curl (or copied alone): fetch the release sources, then run the
# installer they contain. CLICKSHOP_SOURCE_URL overrides the tarball location.
SCRIPT=${BASH_SOURCE[0]:-}
if [ -z "$SCRIPT" ] || [ ! -f "$(dirname "$SCRIPT")/deploy/helm/clickshop/Chart.yaml" ]; then
  command -v tar >/dev/null || die "tar is required"
  SRC=$(mktemp -d "${TMPDIR:-/tmp}/clickshop.XXXXXX")
  URL=${CLICKSHOP_SOURCE_URL:-https://codeload.github.com/$CLICKSHOP_REPO/tar.gz/refs/tags/v$CLICKSHOP_VERSION}
  log "Downloading ClickShop $CLICKSHOP_VERSION ($URL)"
  curl -fsSL "$URL" | tar -xz -C "$SRC" --strip-components=1 || die "cannot download $URL"
  mkdir -p "${XDG_CONFIG_HOME:-$HOME/.config}/clickshop"
  export CLICKSHOP_VALUES_FILE=${CLICKSHOP_VALUES_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/clickshop/${CLICKSHOP_NAMESPACE:-clickshop}.values.yaml}
  exec bash "$SRC/install.sh" "$@"
fi

cd "$(dirname "$SCRIPT")"
CHART=deploy/helm/clickshop
VALUES_FILE=${CLICKSHOP_VALUES_FILE:-values.local.yaml}
NS=${CLICKSHOP_NAMESPACE:-clickshop}
RELEASE=${CLICKSHOP_RELEASE:-clickshop}
NONINTERACTIVE=${CLICKSHOP_NONINTERACTIVE:-}
# Prompts read the terminal directly, so they also work under `curl | bash`.
if [ -z "$NONINTERACTIVE" ] && ! { : </dev/tty; } 2>/dev/null; then NONINTERACTIVE=1; fi

# ask VAR "question" default [secret]
ask() {
  local var=$1 question=$2 default=${3:-} secret=${4:-} value
  value=${!var:-}
  if [ -z "$value" ] && [ -z "$NONINTERACTIVE" ]; then
    if [ -n "$secret" ]; then
      read -r -s -p "$question${default:+ [$default]}: " value </dev/tty; echo
    else
      read -r -p "$question${default:+ [$default]}: " value </dev/tty
    fi
  fi
  printf -v "$var" '%s' "${value:-$default}"
}

choose() {
  local var=$1 question=$2 options=$3 default=$4
  ask "$var" "$question ($options)" "$default"
  case "|$options|" in *"|${!var}|"*) ;; *) die "$var must be one of: $options" ;; esac
}

rand() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "${1:-32}"; }
hex() { openssl rand -hex "$1"; }

for bin in kubectl helm openssl curl; do
  command -v "$bin" >/dev/null || die "$bin is required"
done
kubectl version --request-timeout=10s >/dev/null 2>&1 || die "kubectl cannot reach a cluster (check your kubeconfig)"
if [ -z "${CLICKSHOP_STORAGE_CLASS:-}" ] && ! kubectl get storageclass -o jsonpath='{range .items[*]}{.metadata.annotations.storageclass\.kubernetes\.io/is-default-class}{"\n"}{end}' | grep -qx true; then
  # EKS 1.30+ ships without a default StorageClass. With the EBS CSI driver
  # installed, create a gp3 class for the demo instead of failing.
  if kubectl get csidriver ebs.csi.aws.com >/dev/null 2>&1; then
    kubectl apply -f - >/dev/null <<'EOF'
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: clickshop-gp3
provisioner: ebs.csi.aws.com
parameters: { type: gp3, encrypted: "true" }
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
EOF
    CLICKSHOP_STORAGE_CLASS=clickshop-gp3
    log "No default StorageClass: created clickshop-gp3 (EBS gp3)"
  else
    die "the cluster has no default StorageClass: mark one as default or set CLICKSHOP_STORAGE_CLASS"
  fi
fi

log "ClickShop $CLICKSHOP_VERSION installer: context $(kubectl config current-context 2>/dev/null || echo '?'), namespace $NS"

# --- Images -----------------------------------------------------------------
# Empty = the published images <registry>/clickshop-{web,librechat}:<chart appVersion>.
CLICKSHOP_WEB_IMAGE=${CLICKSHOP_WEB_IMAGE:-}
CLICKSHOP_LIBRECHAT_IMAGE=${CLICKSHOP_LIBRECHAT_IMAGE:-}
CLICKSHOP_IMAGE_REGISTRY=${CLICKSHOP_IMAGE_REGISTRY:-}
CLICKSHOP_IMAGE_TAG=${CLICKSHOP_IMAGE_TAG:-}

# --- Components -------------------------------------------------------------
# "oss" runs everything in the cluster without asking anything else. "custom"
# asks, per component, whether it runs in the cluster or on a Cloud service.
any_set=${CLICKSHOP_CLICKHOUSE:-}${CLICKSHOP_POSTGRES:-}${CLICKSHOP_CDC:-}${CLICKSHOP_LANGFUSE:-}${CLICKSHOP_CLICKSTACK:-}
choose CLICKSHOP_PROFILE "Setup: everything open source in the cluster, or choose Cloud services per component" "oss|custom" "$([ -n "$any_set" ] && echo custom || echo oss)"
if [ "$CLICKSHOP_PROFILE" = oss ]; then
  CLICKSHOP_CLICKHOUSE=${CLICKSHOP_CLICKHOUSE:-oss} CLICKSHOP_POSTGRES=${CLICKSHOP_POSTGRES:-oss}
  CLICKSHOP_CDC=${CLICKSHOP_CDC:-peerdb} CLICKSHOP_LANGFUSE=${CLICKSHOP_LANGFUSE:-oss} CLICKSHOP_CLICKSTACK=${CLICKSHOP_CLICKSTACK:-oss}
fi
choose CLICKSHOP_CLICKHOUSE "ClickHouse" "oss|cloud" oss
choose CLICKSHOP_POSTGRES "Postgres" "oss|cloud" oss
choose CLICKSHOP_CDC "CDC Postgres to ClickHouse" "peerdb|clickpipes|none" "$([ "$CLICKSHOP_POSTGRES" = cloud ] && echo clickpipes || echo peerdb)"
choose CLICKSHOP_LANGFUSE "Langfuse" "oss|cloud|none" oss
choose CLICKSHOP_CLICKSTACK "ClickStack" "oss|cloud|none" oss

CLICKSHOP_CH_DATABASE=${CLICKSHOP_CH_DATABASE:-}
if [ "$CLICKSHOP_CLICKHOUSE" = cloud ]; then
  ask CLICKSHOP_CH_DATABASE "ClickHouse database for the demo (created if missing)" clickshop
  ask CLICKSHOP_CH_HOST "ClickHouse Cloud host (xxx.region.aws.clickhouse.cloud)" ""
  ask CLICKSHOP_CH_USER "ClickHouse Cloud user" default
  ask CLICKSHOP_CH_PASSWORD "ClickHouse Cloud password" "" secret
  ask CLICKSHOP_CH_CONSOLE_URL "ClickHouse Cloud console URL (optional)" ""
  [ -n "$CLICKSHOP_CH_HOST" ] && [ -n "$CLICKSHOP_CH_PASSWORD" ] || die "ClickHouse Cloud host and password are required"
fi
if [ "$CLICKSHOP_POSTGRES" = cloud ]; then
  ask CLICKSHOP_PG_URL "Postgres connection URL (postgresql://user:pass@host:5432/db?sslmode=require)" "" secret
  ask CLICKSHOP_PG_CONSOLE_URL "Postgres console URL (optional)" ""
  [ -n "$CLICKSHOP_PG_URL" ] || die "CLICKSHOP_PG_URL is required"
fi
if [ "$CLICKSHOP_CDC" = clickpipes ]; then
  ask CLICKSHOP_CLICKPIPES_URL "ClickPipes page URL of your service (optional)" ""
fi
if [ "$CLICKSHOP_CDC" = peerdb ] && [ "$CLICKSHOP_CLICKHOUSE" = cloud ]; then
  ask CLICKSHOP_PEERDB_S3_BUCKET "S3 bucket for PeerDB staging (ClickHouse Cloud cannot read the in-cluster MinIO)" ""
  ask CLICKSHOP_PEERDB_S3_REGION "S3 bucket region" "${AWS_REGION:-}"
  ask CLICKSHOP_PEERDB_SERVICE_ACCOUNT "Kubernetes service account with IAM access to the bucket (IRSA or Pod Identity)" peerdb
  [ -n "$CLICKSHOP_PEERDB_S3_BUCKET" ] && [ -n "$CLICKSHOP_PEERDB_S3_REGION" ] || die "PeerDB with ClickHouse Cloud needs CLICKSHOP_PEERDB_S3_BUCKET and CLICKSHOP_PEERDB_S3_REGION (or use CLICKSHOP_CDC=clickpipes)"
fi
if [ "$CLICKSHOP_LANGFUSE" = cloud ]; then
  ask CLICKSHOP_LANGFUSE_BASE_URL "Langfuse base URL" "https://cloud.langfuse.com"
  ask CLICKSHOP_LANGFUSE_PUBLIC_KEY "Langfuse public key" ""
  ask CLICKSHOP_LANGFUSE_SECRET_KEY "Langfuse secret key" "" secret
  [ -n "$CLICKSHOP_LANGFUSE_PUBLIC_KEY" ] && [ -n "$CLICKSHOP_LANGFUSE_SECRET_KEY" ] || die "Langfuse keys are required"
fi
CLICKSHOP_CH_DATABASE=${CLICKSHOP_CH_DATABASE:-clickshop}
CLICKSHOP_LANGFUSE_ENV=${CLICKSHOP_LANGFUSE_ENV:-default}
[ "$CLICKSHOP_LANGFUSE" = cloud ] && ask CLICKSHOP_LANGFUSE_ENV "Langfuse tracing environment tag" "$CLICKSHOP_LANGFUSE_ENV"
CLICKSHOP_ADMIN_EMAIL=${CLICKSHOP_ADMIN_EMAIL:-admin@clickshop.io}
CLICKSHOP_ALLOWED_EMAIL_DOMAIN=${CLICKSHOP_ALLOWED_EMAIL_DOMAIN:-}
if [ "$CLICKSHOP_CLICKSTACK" = cloud ]; then
  ask CLICKSHOP_CLICKSTACK_OTLP "Managed ClickStack OTLP HTTP endpoint" ""
  ask CLICKSHOP_CLICKSTACK_KEY "Managed ClickStack ingestion key" "" secret
  ask CLICKSHOP_CLICKSTACK_UI "Managed ClickStack UI URL (optional)" ""
  [ -n "$CLICKSHOP_CLICKSTACK_OTLP" ] && [ -n "$CLICKSHOP_CLICKSTACK_KEY" ] || die "ClickStack endpoint and key are required"
fi

# --- LLM --------------------------------------------------------------------
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
ask ANTHROPIC_API_KEY "Anthropic API key (empty = local Qwen 2.5 7B via Ollama)" "" secret
ANTHROPIC_MODEL=${ANTHROPIC_MODEL:-claude-sonnet-5}
CLICKSHOP_KEEP_OLLAMA=${CLICKSHOP_KEEP_OLLAMA:-auto}

# --- Network exposure -------------------------------------------------------
if [ -z "${CLICKSHOP_SOURCE_RANGES:-}" ]; then
  MYIP=$(curl -fsS --max-time 5 https://checkip.amazonaws.com | tr -d '[:space:]' || true)
  [ -n "$MYIP" ] || die "cannot detect your public IP, set CLICKSHOP_SOURCE_RANGES"
  CLICKSHOP_SOURCE_RANGES="$MYIP/32"
fi
case ",$CLICKSHOP_SOURCE_RANGES," in *",0.0.0.0/0,"*|*",::/0,"*) die "refusing to expose the demo to 0.0.0.0/0" ;; esac
log "The demo will only accept $CLICKSHOP_SOURCE_RANGES (set CLICKSHOP_SOURCE_RANGES to change it)"

# --- Secrets ----------------------------------------------------------------
kubectl get ns "$NS" >/dev/null 2>&1 || kubectl create ns "$NS" >/dev/null

existing() {
  kubectl -n "$NS" get secret clickshop-secrets -o "jsonpath={.data.$1}" 2>/dev/null | base64 -d 2>/dev/null || true
}
keep() { local v; v=$(existing "$1"); printf '%s' "${v:-$2}"; }

DEMO_PASSWORD=${CLICKSHOP_DEMO_PASSWORD:-$(keep demo-password "Cs-$(rand 12)-9x!")}
PG_PASSWORD=$(keep postgres-password "$(rand 24)")
CH_PASSWORD=${CLICKSHOP_CH_PASSWORD:-$(keep clickhouse-password "$(rand 24)")}
if [ "$CLICKSHOP_POSTGRES" = oss ]; then
  PG_URL="postgresql://postgres:$PG_PASSWORD@postgres:5432/clickshop"
else
  PG_URL=$CLICKSHOP_PG_URL
fi
if [ "$CLICKSHOP_LANGFUSE" = oss ]; then
  LF_PK=$(keep langfuse-public-key "pk-lf-$(rand 24)")
  LF_SK=$(keep langfuse-secret-key "sk-lf-$(rand 32)")
else
  LF_PK=${CLICKSHOP_LANGFUSE_PUBLIC_KEY:-}
  LF_SK=${CLICKSHOP_LANGFUSE_SECRET_KEY:-}
fi

SECRET_ARGS=(
  --from-literal=demo-password="$DEMO_PASSWORD"
  --from-literal=auth-secret="$(keep auth-secret "$(rand 48)")"
  --from-literal=internal-token="$(keep internal-token "$(rand 40)")"
  --from-literal=clickhouse-password="$CH_PASSWORD"
  --from-literal=postgres-password="$PG_PASSWORD"
  --from-literal=postgres-url="$PG_URL"
  --from-literal=minio-password="$(keep minio-password "$(rand 24)")"
  --from-literal=valkey-password="$(keep valkey-password "$(rand 24)")"
  --from-literal=langfuse-public-key="$LF_PK"
  --from-literal=langfuse-secret-key="$LF_SK"
  --from-literal=langfuse-salt="$(keep langfuse-salt "$(rand 32)")"
  --from-literal=langfuse-encryption-key="$(keep langfuse-encryption-key "$(hex 32)")"
  --from-literal=librechat-creds-key="$(keep librechat-creds-key "$(hex 32)")"
  --from-literal=librechat-creds-iv="$(keep librechat-creds-iv "$(hex 16)")"
  --from-literal=librechat-jwt-secret="$(keep librechat-jwt-secret "$(rand 48)")"
  --from-literal=librechat-jwt-refresh-secret="$(keep librechat-jwt-refresh-secret "$(rand 48)")"
  --from-literal=openai-api-key="${CLICKSHOP_OPENAI_API_KEY:-ollama}"
)
[ -n "$ANTHROPIC_API_KEY" ] && SECRET_ARGS+=(--from-literal=anthropic-api-key="$ANTHROPIC_API_KEY")
[ -n "${CLICKSHOP_CLICKSTACK_KEY:-}" ] && SECRET_ARGS+=(--from-literal=clickstack-api-key="$CLICKSHOP_CLICKSTACK_KEY")
[ -n "${CLICKSHOP_PG_SOURCE_PASSWORD:-}" ] && SECRET_ARGS+=(--from-literal=postgres-source-password="$CLICKSHOP_PG_SOURCE_PASSWORD")

kubectl -n "$NS" create secret generic clickshop-secrets "${SECRET_ARGS[@]}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
log "Secret clickshop-secrets updated"

# --- values.local.yaml ------------------------------------------------------
ranges_yaml=$(printf '%s' "$CLICKSHOP_SOURCE_RANGES" | tr ',' '\n' | sed 's/^ *//;s/ *$//' | awk 'NF{printf "    - \"%s\"\n", $0}')
write_values() {
  cat > "$VALUES_FILE" <<EOF
# Generated by install.sh. Contains no secrets (see Secret clickshop-secrets).
publicHost: "${PUBLIC_HOST:-}"
images:
$([ -n "$CLICKSHOP_IMAGE_REGISTRY" ] && echo "  registry: \"$CLICKSHOP_IMAGE_REGISTRY\"")
  tag: "$CLICKSHOP_IMAGE_TAG"
  web: "$CLICKSHOP_WEB_IMAGE"
  librechat: "$CLICKSHOP_LIBRECHAT_IMAGE"
storageClass: "${CLICKSHOP_STORAGE_CLASS:-}"
auth:
  adminEmail: "$CLICKSHOP_ADMIN_EMAIL"
  allowedEmailDomain: "$CLICKSHOP_ALLOWED_EMAIL_DOMAIN"
clickhouse:
  mode: $CLICKSHOP_CLICKHOUSE
  database: "$CLICKSHOP_CH_DATABASE"
  host: "${CLICKSHOP_CH_HOST:-}"
  user: "${CLICKSHOP_CH_USER:-default}"
  consoleUrl: "${CLICKSHOP_CH_CONSOLE_URL:-}"
postgres:
  mode: $CLICKSHOP_POSTGRES
  consoleUrl: "${CLICKSHOP_PG_CONSOLE_URL:-}"
cdc:
  mode: $CLICKSHOP_CDC
  clickpipesUrl: "${CLICKSHOP_CLICKPIPES_URL:-}"
  staging:
    type: $([ -n "${CLICKSHOP_PEERDB_S3_BUCKET:-}" ] && echo s3 || echo minio)
    bucket: "${CLICKSHOP_PEERDB_S3_BUCKET:-}"
    region: "${CLICKSHOP_PEERDB_S3_REGION:-}"
    serviceAccount: "${CLICKSHOP_PEERDB_SERVICE_ACCOUNT:-}"
langfuse:
  mode: $CLICKSHOP_LANGFUSE
  baseUrl: "${CLICKSHOP_LANGFUSE_BASE_URL:-}"
  environment: "$CLICKSHOP_LANGFUSE_ENV"
clickstack:
  mode: $CLICKSHOP_CLICKSTACK
  otlpEndpoint: "${CLICKSHOP_CLICKSTACK_OTLP:-}"
  uiUrl: "${CLICKSHOP_CLICKSTACK_UI:-}"
llm:
  hasAnthropicKey: $([ -n "$ANTHROPIC_API_KEY" ] && echo true || echo false)
  anthropicModel: "$ANTHROPIC_MODEL"
ollama:
  enabled: $CLICKSHOP_KEEP_OLLAMA
data:
  pageEvents: ${CLICKSHOP_PAGE_EVENTS:-2000000}
  feedbackRows: ${CLICKSHOP_FEEDBACK_ROWS:-1000000}
gateway:
  sourceRanges:
$ranges_yaml
EOF
}

helm_install() {
  helm upgrade --install "$RELEASE" "$CHART" -n "$NS" -f "$VALUES_FILE" ${CLICKSHOP_EXTRA_VALUES:+-f "$CLICKSHOP_EXTRA_VALUES"} --timeout 15m >/dev/null
}

PUBLIC_HOST=${CLICKSHOP_PUBLIC_HOST:-$(grep -E '^publicHost:' "$VALUES_FILE" 2>/dev/null | sed -E 's/publicHost: *"?([^"]*)"?/\1/' || true)}
write_values
log "Installing Helm release $RELEASE"
helm_install

if [ -z "$PUBLIC_HOST" ]; then
  log "Waiting for the gateway load balancer address"
  for _ in $(seq 1 60); do
    PUBLIC_HOST=$(kubectl -n "$NS" get svc gateway -o jsonpath='{.status.loadBalancer.ingress[0].hostname}{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true)
    [ -n "$PUBLIC_HOST" ] && break
    sleep 10
  done
  [ -n "$PUBLIC_HOST" ] || die "the gateway Service got no external address (does the cluster support LoadBalancer Services?)"
  write_values
  log "Gateway address: $PUBLIC_HOST (re-applying with public URLs)"
  helm_install
fi

log "Waiting for workloads (the first start pulls images and the LLM model, allow 10 to 20 minutes)"
for r in $(kubectl -n "$NS" get deploy,statefulset -o name); do
  kubectl -n "$NS" rollout status "$r" --timeout=30m >/dev/null || log "$r is not ready yet: kubectl -n $NS get pods"
done
JOB=$(kubectl -n "$NS" get jobs -l app.kubernetes.io/component=init --sort-by=.metadata.creationTimestamp -o name | tail -1)
if [ -n "$JOB" ]; then
  log "Waiting for $JOB (schema, demo data, CDC mirror, accounts)"
  kubectl -n "$NS" wait --for=condition=complete "$JOB" --timeout=40m >/dev/null || log "init job not complete yet: kubectl -n $NS logs $JOB --all-containers"
fi

port() { grep -A6 '^  ports:' "$CHART/values.yaml" | grep " $1:" | awk '{print $2}'; }
DOMAIN=clickshop.io
cat <<EOF

ClickShop is ready.

  Web app       http://$PUBLIC_HOST
EOF
[ "$CLICKSHOP_LANGFUSE" = oss ] && echo "  Langfuse      http://$PUBLIC_HOST:$(port langfuse)   ($CLICKSHOP_ADMIN_EMAIL)"
[ "$CLICKSHOP_CLICKSTACK" = oss ] && echo "  HyperDX       http://$PUBLIC_HOST:$(port hyperdx)   ($CLICKSHOP_ADMIN_EMAIL)"
[ "$CLICKSHOP_CDC" = peerdb ] && echo "  PeerDB UI     http://$PUBLIC_HOST:$(port peerdb)"
cat <<EOF

  Admin         $CLICKSHOP_ADMIN_EMAIL
  Personas      ceo, sales, data, sre, ai-engineer @$DOMAIN
  Password      $DEMO_PASSWORD

  Allowed from  $CLICKSHOP_SOURCE_RANGES
EOF
if [ "$CLICKSHOP_CDC" = clickpipes ]; then
  cat <<EOF

  ClickPipes: create a Postgres CDC pipe in the ClickHouse Cloud console
  from your Postgres to database "$CLICKSHOP_CH_DATABASE", tables customers,
  products, orders, order_items, payment_status_current, sales_rep_accounts,
  vip_customer_flags, with table names prefixed "public_". The init job
  finishes once the tables appear.
EOF
fi
