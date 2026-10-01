"use client";

import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number;
  icon?: LucideIcon;
  format?: "number" | "currency" | "percent";
}

function formatValue(value: string | number, format?: string): string {
  if (typeof value === "string") return value;
  switch (format) {
    case "currency":
      return `€${Math.round(value).toLocaleString("en-US")}`;
    case "percent":
      return `${value.toFixed(2)}%`;
    default:
      return value.toLocaleString("en-US");
  }
}

function useAnimatedNumber(target: number, duration = 600): number {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);

  useEffect(() => {
    const from = prev.current;
    if (from === target) return;
    const start = performance.now();
    let raf: number;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (target - from) * ease));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    prev.current = target;
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return display;
}

export function KpiCard({ title, value, subtitle, change, icon: Icon, format }: KpiCardProps) {
  const numericValue = typeof value === "number" ? value : 0;
  const animated = useAnimatedNumber(numericValue);
  const displayValue = typeof value === "number" ? animated : value;

  return (
    <div
      className="group rounded-xl border border-[--border] bg-[--surface] px-3.5 py-3 transition-all duration-200 hover:border-[--muted-fg]/25 hover:shadow-md"
      style={{ boxShadow: `0 1px 3px var(--card-shadow)` }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-[--muted]" title={title}>
          {title}
        </p>
        {Icon && (
          <Icon className="h-3.5 w-3.5 flex-shrink-0 text-[--muted] transition-colors duration-200 group-hover:text-[--brand]" />
        )}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="truncate text-xl font-bold leading-tight text-[--fg] tabular-nums">
          {formatValue(displayValue, format)}
        </p>
        {change !== undefined && (
          <span
            className={`flex-shrink-0 whitespace-nowrap text-[11px] font-semibold tabular-nums ${
              change >= 0 ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      {subtitle && <p className="mt-0.5 truncate text-[10px] text-[--muted]">{subtitle}</p>}
    </div>
  );
}
