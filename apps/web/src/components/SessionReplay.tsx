"use client";

import { useEffect } from "react";
import HyperDX from "@hyperdx/browser";
import { useUser } from "@/lib/user-context";

export function SessionReplay() {
  const { user } = useUser();

  useEffect(() => {
    try {
      const isProduction = typeof window !== "undefined" && window.location.hostname !== "localhost";
      const gitSha: string = process.env.NEXT_PUBLIC_BUILD_SHA ?? "";
      const sameHost = new RegExp(window.location.host.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

      HyperDX.init({
        // Same-origin: next.config.js rewrites /otel/v1/* to the in-cluster collector.
        url: `${window.location.origin}/otel`,
        apiKey: "clickshop",
        service: "clickshop-frontend",
        consoleCapture: true,
        // Captures request/response headers and bodies on fetch/XHR.
        advancedNetworkCapture: true,
        recordCanvas: true,
        // Demo app with fake data: capture full text/inputs in session replay.
        maskAllInputs: false,
        maskAllText: false,
        tracePropagationTargets: [/localhost/i, sameHost],
        otelResourceAttributes: {
          "service.namespace": "clickshop",
          "service.version": gitSha ? gitSha.slice(0, 12) : "dev",
          "deployment.environment": isProduction ? "production" : "development",
        },
      });

      HyperDX.setGlobalAttributes({
        userId: user.id,
        userEmail: user.chatEmail,
        userName: user.label,
        teamName: "ClickShop Engineering",
        userRole: user.id,
      });

      // Surface unhandled browser errors as HyperDX exceptions.
      const onError = (evt: ErrorEvent) => {
        try { HyperDX.recordException(evt.error ?? evt.message, { source: "window.onerror" }); } catch { /* noop */ }
      };
      const onRejection = (evt: PromiseRejectionEvent) => {
        try { HyperDX.recordException(evt.reason, { source: "unhandledrejection" }); } catch { /* noop */ }
      };
      window.addEventListener("error", onError);
      window.addEventListener("unhandledrejection", onRejection);
      return () => {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
      };
    } catch (err) {
      console.warn("[SessionReplay] init failed:", err);
    }
  }, [user]);

  return null;
}
