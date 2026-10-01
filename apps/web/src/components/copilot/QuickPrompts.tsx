"use client";

import { useState } from "react";
import { Sparkles, Send, Check, ChevronDown, ChevronUp } from "lucide-react";

const prompts: Record<string, string[]> = {
  ceo: [
    "Why is revenue underperforming today?",
    "Compare today vs yesterday for revenue and conversion.",
    "Which region is driving the largest decline?",
    "Summarize the top 3 business risks right now.",
    "Give me a 5-line executive summary.",
  ],
  sales: [
    "Which products are performing best today?",
    "Which payment methods fail the most?",
    "Which VIP customers are impacted by checkout issues?",
    "Which country has the worst conversion drop?",
    "What should the sales team focus on first today?",
  ],
  general: [
    "Why did checkout conversion drop in the last 30 minutes?",
    "Show the trend of payment failures in the last hour.",
    "Compare conversion by device and country.",
    "Which product categories are underperforming this week?",
    "Which customers should we proactively contact?",
  ],
};

export function QuickPrompts({ persona, onPromptClick }: { persona: string; onPromptClick?: (prompt: string) => void }) {
  const items = prompts[persona] ?? prompts.general;
  const [copied, setCopied] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleClick = (prompt: string) => {
    navigator.clipboard.writeText(prompt);
    setCopied(prompt);
    onPromptClick?.(prompt);
    setTimeout(() => setCopied(null), 2000);
  };

  const visible = expanded ? items : items.slice(0, 1);

  return (
    <div className="border-b border-[--border] bg-[--bg] px-4 py-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mb-1.5 flex w-full items-center gap-1 text-xs font-medium text-[--muted] hover:text-[--muted-fg] transition-colors"
      >
        <Sparkles className="h-3 w-3" />
        Suggested questions
        <span className="ml-auto">
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </span>
      </button>
      <div className={`flex flex-col gap-1 ${expanded ? "max-h-40 overflow-y-auto" : ""}`}>
        {visible.map((prompt) => (
          <button
            key={prompt}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs text-left transition-colors ${
              copied === prompt
                ? "border-[--brand] bg-[--brand-badge-bg] text-[--brand]"
                : "border-[--border] bg-[--surface] text-[--muted-fg] hover:border-[--brand] hover:bg-[--brand-dim] hover:text-[--brand]"
            }`}
            onClick={() => handleClick(prompt)}
          >
            {copied === prompt ? <Check className="h-2.5 w-2.5 shrink-0" /> : <Send className="h-2.5 w-2.5 shrink-0" />}
            {copied === prompt ? "Copied!" : prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
