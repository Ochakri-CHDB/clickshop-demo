"use client";

import { useEffect, useState } from "react";

export type DeployMode = "oss" | "cloud";

export interface PublicConfig {
  modes: {
    clickhouse: DeployMode;
    postgres: DeployMode;
    langfuse: DeployMode;
    clickstack: DeployMode;
    cdc: "peerdb" | "clickpipes" | "none";
  };
  llm: { provider: "anthropic" | "openai-compatible"; model: string };
  links: {
    langfuse: string;
    clickstack: string;
    clickhouseConsole: string;
    postgresConsole: string;
    cdc: string;
    librechat: string;
  };
  librechat: { url: string; autoLoginPassword: string };
  accounts: { domain: string };
  otel: { browserEndpoint: string };
}

export const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  modes: { clickhouse: "oss", postgres: "oss", langfuse: "oss", clickstack: "oss", cdc: "peerdb" },
  llm: { provider: "openai-compatible", model: "" },
  links: { langfuse: "", clickstack: "", clickhouseConsole: "", postgresConsole: "", cdc: "", librechat: "" },
  librechat: { url: "", autoLoginPassword: "" },
  accounts: { domain: "clickshop.io" },
  otel: { browserEndpoint: "/otel" },
};

let cache: PublicConfig | null = null;
let inflight: Promise<PublicConfig> | null = null;

export function loadPublicConfig(): Promise<PublicConfig> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = fetch("/api/public-config", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : DEFAULT_PUBLIC_CONFIG))
      .then((c: PublicConfig) => {
        cache = c;
        return c;
      })
      .catch(() => DEFAULT_PUBLIC_CONFIG)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function usePublicConfig(): PublicConfig {
  const [config, setConfig] = useState<PublicConfig>(cache ?? DEFAULT_PUBLIC_CONFIG);
  useEffect(() => {
    let alive = true;
    loadPublicConfig().then((c) => alive && setConfig(c));
    return () => {
      alive = false;
    };
  }, []);
  return config;
}

/** LibreChat account of a persona, e.g. personaEmail(config, "ceo@clickshop.io"). */
export function personaEmail(c: PublicConfig, email: string): string {
  return `${email.split("@")[0]}@${c.accounts?.domain || "clickshop.io"}`;
}

/** Display names that follow the deployment mode of each component. */
export function productNames(c: PublicConfig) {
  return {
    clickhouse: c.modes.clickhouse === "cloud" ? "ClickHouse Cloud" : "ClickHouse OSS",
    postgres: c.modes.postgres === "cloud" ? "Postgres (managed)" : "PostgreSQL OSS",
    langfuse: c.modes.langfuse === "cloud" ? "Langfuse Cloud" : "Langfuse OSS",
    clickstack: c.modes.clickstack === "cloud" ? "Managed ClickStack" : "ClickStack OSS (HyperDX)",
    cdc: c.modes.cdc === "clickpipes" ? "ClickPipes CDC" : c.modes.cdc === "none" ? "CDC (disabled)" : "PeerDB CDC",
    llm: c.llm.provider === "anthropic" ? `Claude (${c.llm.model})` : `${c.llm.model || "local model"} via Ollama`,
  };
}
