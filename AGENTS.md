# Agent instructions (ClickShop demo)

Shared playbook for coding agents: Cursor and Codex read this file natively, Claude Code reads it through `CLAUDE.md`. The README stays the reference for humans; this file lists what an agent must do and must not do when it installs, upgrades or releases the demo.

## What this repo is

A retail analytics demo on ClickHouse, deployed on Kubernetes with one Helm chart (`deploy/helm/clickshop`). Each component runs in the cluster (`oss`) or on a Cloud service (`cloud`):

| Component | `oss` | `cloud` |
|---|---|---|
| ClickHouse | ClickHouse server in the cluster | ClickHouse Cloud service |
| Postgres | Postgres 18 in the cluster | Any Postgres URL |
| CDC | PeerDB | ClickPipes |
| Langfuse | Langfuse v4 in the cluster | Langfuse Cloud |
| ClickStack | HyperDX + OTel collector | Managed ClickStack |
| LLM | Ollama, `qwen2.5:7b` | Anthropic `claude-sonnet-5-5` |

## Install or upgrade

Always go through `install.sh`. It creates the Secret, keeps generated passwords on re-runs, restricts the load balancer and waits for the init job.

```bash
./install.sh                                   # interactive, from a checkout
CLICKSHOP_NONINTERACTIVE=1 \
CLICKSHOP_SOURCE_RANGES=203.0.113.10/32 \
ANTHROPIC_API_KEY=sk-ant-... ./install.sh      # non-interactive
```

- Re-running `install.sh` is the upgrade path. Do not call `helm upgrade` by hand unless the user asks: the script re-applies the public URLs after the load balancer gets its address.
- Choices without secrets go to `values.local.yaml` (checkout) or `~/.config/clickshop/<namespace>.values.yaml` (curl). Secrets only live in the `clickshop-secrets` Secret.
- First install takes 15 to 25 minutes (images, the 4.7 GB model, 3M demo rows).

## Models

- With an Anthropic key: `claude-sonnet-5-5` (`ANTHROPIC_MODEL`, `llm.anthropicModel`). Ollama is not deployed unless `CLICKSHOP_KEEP_OLLAMA=true`.
- Without a key: the bundled Ollama with `qwen2.5:7b` (`ollama.model`, `llm.openaiModel`).
- Any replacement local model must support tool calling (tag `tools` on ollama.com/library), because every agent queries data through MCP. `gemma2`, `gemma3` and `phi3` do not.
- Do not add a paid LLM gateway (OpenRouter or similar) as a default.

## Verify after install

1. `kubectl -n clickshop get pods`: everything `Running`, init job `Completed`.
2. The web app URL printed by the installer loads; sign in with the admin account and the generated password (`kubectl -n clickshop get secret clickshop-secrets -o jsonpath='{.data.demo-password}' | base64 -d`).
3. One LibreChat persona agent answers with live ClickHouse data.
4. Langfuse shows a trace for that chat turn.

## Release (maintainers)

1. Same version in `deploy/helm/clickshop/Chart.yaml` (`version` and `appVersion`) and in `CLICKSHOP_VERSION` at the top of `install.sh`.
2. Open a PR; CI must pass (chart lint and render, shellcheck, `tsc`).
3. After merge on `main`: `git tag vX.Y.Z && git push origin vX.Y.Z`. The release workflow publishes both images and the chart on GHCR and fails if the tag and `appVersion` differ.
4. Only tag when the user asks: a tag publishes public images.

## Safety

- This repository is public. Never commit keys, passwords, hostnames of private services or `values.local.yaml`.
- Keep every image pinned in `values.yaml` (`images.*`). No floating tags.
- Databases stay `ClusterIP`. The chart must keep refusing to render without `gateway.sourceRanges` or with `0.0.0.0/0`.
- SQL stays read-only for every account.
- No `git push --force` to `main` and no `--no-verify` unless the user asks.
