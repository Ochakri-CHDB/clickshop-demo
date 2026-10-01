{{- define "cs.labels" -}}
app.kubernetes.io/part-of: clickshop
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "cs.selector" -}}
app.kubernetes.io/name: {{ . }}
{{- end -}}

{{- define "cs.secretRef" -}}
valueFrom:
  secretKeyRef:
    name: {{ .root.Values.secretName }}
    key: {{ .key }}
    {{- if .optional }}
    optional: true
    {{- end }}
{{- end -}}

{{/* ClickShop images: an explicit images.web / images.librechat wins, otherwise <images.registry>/clickshop-<name>:<appVersion>. */}}
{{- define "cs.image" -}}
{{- $explicit := index .root.Values.images .name -}}
{{- if $explicit -}}
{{- $explicit -}}
{{- else -}}
{{- $registry := required "images.registry is required when images.web / images.librechat are empty" .root.Values.images.registry -}}
{{- printf "%s/clickshop-%s:%s" (trimSuffix "/" $registry) .name (.root.Values.images.tag | default .root.Chart.AppVersion) -}}
{{- end -}}
{{- end -}}

{{/* Anthropic is used when the provider is forced, or when auto and a key is set in values (install.sh sets llm.hasAnthropicKey). */}}
{{- define "cs.llmProvider" -}}
{{- if eq .Values.llm.provider "auto" -}}
{{- if .Values.llm.hasAnthropicKey -}}anthropic{{- else -}}openai-compatible{{- end -}}
{{- else -}}
{{- .Values.llm.provider -}}
{{- end -}}
{{- end -}}

{{- define "cs.ollamaEnabled" -}}
{{- $e := toString .Values.ollama.enabled -}}
{{- if eq $e "auto" -}}
{{- if eq (include "cs.llmProvider" .) "anthropic" -}}false{{- else -}}{{- if .Values.llm.openaiBaseUrl -}}false{{- else -}}true{{- end -}}{{- end -}}
{{- else -}}
{{- $e -}}
{{- end -}}
{{- end -}}

{{- define "cs.chHost" -}}
{{- if eq .Values.clickhouse.mode "cloud" -}}{{ .Values.clickhouse.host }}{{- else -}}clickhouse{{- end -}}
{{- end -}}
{{- define "cs.chHttpPort" -}}
{{- if eq .Values.clickhouse.mode "cloud" -}}{{ .Values.clickhouse.port | default 8443 }}{{- else -}}8123{{- end -}}
{{- end -}}
{{- define "cs.chNativePort" -}}
{{- if eq .Values.clickhouse.mode "cloud" -}}9440{{- else -}}9000{{- end -}}
{{- end -}}
{{- define "cs.chSecure" -}}
{{- if eq .Values.clickhouse.mode "cloud" -}}true{{- else -}}false{{- end -}}
{{- end -}}
{{- define "cs.chUser" -}}
{{- if eq .Values.clickhouse.mode "cloud" -}}{{ .Values.clickhouse.user | default "default" }}{{- else -}}default{{- end -}}
{{- end -}}

{{/* In-cluster Postgres is needed for the app (oss), the PeerDB catalog, Temporal and Langfuse OSS. */}}
{{- define "cs.postgresEnabled" -}}
{{- if or (eq .Values.postgres.mode "oss") (eq .Values.cdc.mode "peerdb") (eq .Values.langfuse.mode "oss") -}}true{{- else -}}false{{- end -}}
{{- end -}}
{{- define "cs.minioEnabled" -}}
{{- if or (eq .Values.cdc.mode "peerdb") (eq .Values.langfuse.mode "oss") -}}true{{- else -}}false{{- end -}}
{{- end -}}
{{- define "cs.mongoEnabled" -}}true{{- end -}}

{{- define "cs.langfuseBaseUrl" -}}
{{- if eq .Values.langfuse.mode "oss" -}}http://langfuse-web:3000{{- else if eq .Values.langfuse.mode "cloud" -}}{{ .Values.langfuse.baseUrl }}{{- end -}}
{{- end -}}

{{- define "cs.publicUrl" -}}
{{- $root := .root -}}
{{- if and $root.Values.ingress.enabled (index $root.Values.ingress.hosts .name) -}}
{{- if $root.Values.ingress.tls -}}https{{- else -}}http{{- end -}}://{{ index $root.Values.ingress.hosts .name }}
{{- else if $root.Values.publicHost -}}
http://{{ $root.Values.publicHost }}{{ if ne (toString .port) "80" }}:{{ .port }}{{ end }}
{{- end -}}
{{- end -}}

{{- define "cs.storageClass" -}}
{{- if .Values.storageClass }}
storageClassName: {{ .Values.storageClass }}
{{- end }}
{{- end -}}

{{/* Waits for a TCP port, used as initContainer. */}}
{{- define "cs.waitFor" -}}
- name: wait-{{ .name }}
  image: {{ .root.Values.images.busybox }}
  command: ["sh", "-c", "until nc -z -w 2 {{ .host }} {{ .port }}; do echo waiting for {{ .host }}:{{ .port }}; sleep 3; done"]
{{- end -}}

{{- define "cs.peerdbEnv" -}}
- name: PEERDB_CATALOG_HOST
  value: postgres
- name: PEERDB_CATALOG_PORT
  value: "5432"
- name: PEERDB_CATALOG_USER
  value: postgres
- name: PEERDB_CATALOG_PASSWORD
  {{- include "cs.secretRef" (dict "root" . "key" "postgres-password") | nindent 2 }}
- name: PEERDB_CATALOG_DATABASE
  value: peerdb
- name: TEMPORAL_HOST_PORT
  value: temporal:7233
- name: PEERDB_TEMPORAL_NAMESPACE
  value: default
{{- if eq .Values.cdc.staging.type "s3" }}
{{- /* Any PEERDB_CLICKHOUSE_AWS_CREDENTIALS_* variable switches PeerDB to static
       keys, so the region goes through the standard AWS chain instead. */}}
- name: AWS_REGION
  value: {{ required "cdc.staging.region is required" .Values.cdc.staging.region | quote }}
- name: PEERDB_CLICKHOUSE_AWS_S3_BUCKET_NAME
  value: {{ required "cdc.staging.bucket is required" .Values.cdc.staging.bucket | quote }}
{{- else }}
- name: PEERDB_CLICKHOUSE_AWS_CREDENTIALS_AWS_ACCESS_KEY_ID
  value: clickshop
- name: PEERDB_CLICKHOUSE_AWS_CREDENTIALS_AWS_SECRET_ACCESS_KEY
  {{- include "cs.secretRef" (dict "root" . "key" "minio-password") | nindent 2 }}
- name: PEERDB_CLICKHOUSE_AWS_CREDENTIALS_AWS_REGION
  value: us-east-1
- name: PEERDB_CLICKHOUSE_AWS_CREDENTIALS_AWS_ENDPOINT_URL_S3
  value: http://minio:9000
- name: PEERDB_CLICKHOUSE_AWS_S3_BUCKET_NAME
  value: peerdb
{{- end }}
{{- end -}}

{{/* Connection and LLM settings shared by the web app, LibreChat and jobs. */}}
{{- define "cs.appEnv" -}}
- name: CLICKHOUSE_HOST
  value: {{ include "cs.chHost" . | quote }}
- name: CLICKHOUSE_PORT
  value: {{ include "cs.chHttpPort" . | quote }}
- name: CLICKHOUSE_SECURE
  value: {{ include "cs.chSecure" . | quote }}
- name: CLICKHOUSE_USER
  value: {{ include "cs.chUser" . | quote }}
- name: CLICKHOUSE_PASSWORD
  {{- include "cs.secretRef" (dict "root" . "key" "clickhouse-password") | nindent 2 }}
- name: CLICKHOUSE_DATABASE
  value: {{ .Values.clickhouse.database | quote }}
- name: POSTGRES_URL
  {{- include "cs.secretRef" (dict "root" . "key" "postgres-url") | nindent 2 }}
- name: POSTGRES_HOST
  value: {{ if eq .Values.postgres.mode "oss" }}postgres{{ else }}managed-postgres{{ end }}
- name: MODE_CLICKHOUSE
  value: {{ .Values.clickhouse.mode | quote }}
- name: MODE_POSTGRES
  value: {{ .Values.postgres.mode | quote }}
- name: MODE_CDC
  value: {{ .Values.cdc.mode | quote }}
- name: MODE_LANGFUSE
  value: {{ .Values.langfuse.mode | quote }}
- name: MODE_CLICKSTACK
  value: {{ .Values.clickstack.mode | quote }}
{{- if ne .Values.langfuse.mode "none" }}
- name: LANGFUSE_BASE_URL
  value: {{ include "cs.langfuseBaseUrl" . | quote }}
- name: LANGFUSE_PUBLIC_KEY
  {{- include "cs.secretRef" (dict "root" . "key" "langfuse-public-key") | nindent 2 }}
- name: LANGFUSE_SECRET_KEY
  {{- include "cs.secretRef" (dict "root" . "key" "langfuse-secret-key") | nindent 2 }}
- name: LANGFUSE_TRACING_ENVIRONMENT
  value: {{ .Values.langfuse.environment | quote }}
{{- end }}
- name: LLM_PROVIDER
  value: {{ include "cs.llmProvider" . | quote }}
{{- if eq (include "cs.llmProvider" .) "anthropic" }}
- name: ANTHROPIC_API_KEY
  {{- include "cs.secretRef" (dict "root" . "key" "anthropic-api-key") | nindent 2 }}
- name: ANTHROPIC_MODEL
  value: {{ .Values.llm.anthropicModel | quote }}
- name: LLM_MODEL
  value: {{ .Values.llm.anthropicModel | quote }}
{{- else }}
- name: OPENAI_BASE_URL
  value: {{ .Values.llm.openaiBaseUrl | default "http://ollama:11434/v1" | quote }}
- name: LLM_OPENAI_API_KEY
  {{- include "cs.secretRef" (dict "root" . "key" "openai-api-key" "optional" true) | nindent 2 }}
- name: OPENAI_MODEL
  value: {{ .Values.llm.openaiModel | quote }}
- name: LLM_MODEL
  value: {{ .Values.llm.openaiModel | quote }}
{{- end }}
{{- if .Values.llm.label }}
- name: LLM_LABEL
  value: {{ .Values.llm.label | quote }}
{{- end }}
- name: DEMO_PASSWORD
  {{- include "cs.secretRef" (dict "root" . "key" "demo-password") | nindent 2 }}
- name: DEMO_EMAIL_DOMAIN
  value: {{ .Values.demoEmailDomain | quote }}
- name: ADMIN_EMAIL
  value: {{ include "cs.adminEmail" . | quote }}
{{- end -}}

{{- define "cs.adminEmail" -}}
{{- .Values.auth.adminEmail | default (printf "admin@%s" .Values.demoEmailDomain) -}}
{{- end -}}
