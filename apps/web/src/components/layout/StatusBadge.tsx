"use client";

type Status = "connected" | "degraded" | "disconnected" | "checking";

const colors: Record<Status, string> = {
  connected: "bg-emerald-400",
  degraded: "bg-amber-400",
  disconnected: "bg-red-400",
  checking: "bg-zinc-500 animate-pulse",
};

const labels: Record<Status, string> = {
  connected: "Connected",
  degraded: "Degraded",
  disconnected: "Disconnected",
  checking: "Checking…",
};

export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className={`h-2 w-2 rounded-full ${colors[status]}`} />
      <span className="text-zinc-400">{label ?? labels[status]}</span>
    </span>
  );
}
