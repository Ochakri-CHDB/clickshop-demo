import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { LLM_MODEL, LLM_PROVIDER } from "@/lib/llm";

export const dynamic = "force-dynamic";

type Mode = "oss" | "cloud";

function mode(name: string): Mode {
  return process.env[name] === "cloud" ? "cloud" : "oss";
}

/**
 * Runtime configuration for the browser. Images are generic (no build-time
 * NEXT_PUBLIC_* values), so links and deployment modes come from here.
 */
export async function GET() {
  const session = await auth();
  const signedIn = Boolean(session?.user?.email);
  const cdc = process.env.MODE_CDC || "peerdb";

  return NextResponse.json({
    modes: {
      clickhouse: mode("MODE_CLICKHOUSE"),
      postgres: mode("MODE_POSTGRES"),
      langfuse: mode("MODE_LANGFUSE"),
      clickstack: mode("MODE_CLICKSTACK"),
      cdc: cdc === "clickpipes" || cdc === "none" ? cdc : "peerdb",
    },
    llm: { provider: LLM_PROVIDER, model: LLM_MODEL },
    links: {
      langfuse: process.env.LINK_LANGFUSE || "",
      clickstack: process.env.LINK_CLICKSTACK || "",
      clickhouseConsole: process.env.LINK_CLICKHOUSE_CONSOLE || "",
      postgresConsole: process.env.LINK_POSTGRES_CONSOLE || "",
      cdc: process.env.LINK_CDC || "",
      librechat: process.env.LINK_LIBRECHAT || "",
    },
    librechat: {
      // Same-origin by default: the web app proxies LibreChat (see next.config.js).
      url: process.env.LIBRECHAT_PUBLIC_URL || "",
      autoLoginPassword: signedIn && process.env.DEMO_AUTOLOGIN !== "false" ? process.env.DEMO_PASSWORD || "" : "",
    },
    accounts: { domain: process.env.DEMO_EMAIL_DOMAIN || "clickshop.io" },
    otel: {
      browserEndpoint: process.env.OTEL_BROWSER_ENDPOINT || "/otel",
    },
  });
}
