"use client";

import { useState } from "react";
import { ShoppingBag, ExternalLink, X, Maximize2, Minimize2 } from "lucide-react";
import { personaEmail, usePublicConfig } from "@/lib/public-config";

interface CopilotPanelProps {
  persona: "ceo" | "sales" | "general" | "sre" | "ai";
  libreChatUrl?: string;
}

// Each embedded panel logs into LibreChat as its own persona user, regardless
// of the app-level role selector (which defaults to admin@clickshop.io).
const personaConfig = {
  ceo:     { title: "CEO Agent",   color: "from-brand-400 to-brand-500",   specSlug: "clickshop-ceo-agent",   chatEmail: "ceo@clickshop.io" },
  sales:   { title: "Sales Agent", color: "from-emerald-400 to-emerald-500", specSlug: "clickshop-sales-agent", chatEmail: "sales@clickshop.io" },
  general: { title: "Data Agent",  color: "from-violet-400 to-violet-500", specSlug: "clickshop-data-agent",  chatEmail: "data@clickshop.io" },
  sre:     { title: "SRE Agent",   color: "from-rose-400 to-rose-500",     specSlug: "clickshop-sre-agent",   chatEmail: "sre@clickshop.io" },
  ai:      { title: "AI Engineer Agent", color: "from-sky-400 to-sky-500", specSlug: "clickshop-ai-engineer-agent", chatEmail: "ai-engineer@clickshop.io" },
};

export function CopilotPanel({ persona, libreChatUrl }: CopilotPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const config = personaConfig[persona];
  const publicConfig = usePublicConfig();
  const baseUrl = libreChatUrl ?? publicConfig.librechat.url;

  const params = new URLSearchParams({
    email: personaEmail(publicConfig, config.chatEmail),
    spec: config.specSlug,
    source: `workspace-${persona}`,
  });
  const password = publicConfig.librechat.autoLoginPassword;
  if (password) params.set("password", password);
  const iframeSrc = `${baseUrl.replace(/\/$/, "")}/auto-login.html?${params.toString()}`;

  const handleOpen = () => setIsOpen(true);

  if (!isOpen) {
    return (
      <button
        onClick={handleOpen}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-r ${config.color} text-zinc-950 shadow-lg shadow-brand-400/20 transition-transform hover:scale-110`}
        title={`Open ${config.title}`}
      >
        <ShoppingBag className="h-6 w-6" />
      </button>
    );
  }

  const panelClass = isExpanded
    ? "fixed inset-4 z-50"
    : "fixed bottom-6 right-6 z-50 h-[600px] w-[420px]";

  return (
    <div className={`${panelClass} flex flex-col overflow-hidden rounded-2xl border border-[--border] bg-[--surface-solid] shadow-2xl`}>
      <div className={`flex items-center justify-between bg-gradient-to-r ${config.color} px-4 py-3 text-zinc-950`}>
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5" />
          <span className="text-sm font-semibold">{config.title}</span>
        </div>
        <div className="flex items-center gap-1">
          <a href={baseUrl} target="_blank" rel="noopener noreferrer" className="rounded p-1 hover:bg-black/10" title="Open in new tab">
            <ExternalLink className="h-4 w-4" />
          </a>
          <button onClick={() => setIsExpanded(!isExpanded)} className="rounded p-1 hover:bg-black/10">
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="rounded p-1 hover:bg-black/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1">
        <iframe
          src={iframeSrc}
          key={iframeSrc}
          title={config.title}
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write"
        />
      </div>
    </div>
  );
}
