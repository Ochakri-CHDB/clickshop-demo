"use client";

import { useTheme } from "@/lib/theme-context";
import { CHART_TOKENS } from "@/lib/chart-theme";

interface GaugeChartProps {
  title: string;
  value: number;
  max?: number;
  suffix?: string;
  thresholds?: { good: number; warn: number };
  queryTimeMs?: number;
}

export function GaugeChart({ title, value, max = 100, suffix = "%", thresholds, queryTimeMs }: GaugeChartProps) {
  const { theme } = useTheme();
  const t = CHART_TOKENS[theme];

  const pct = Math.min(value / max, 1);
  const angle = pct * 180;
  const r = 60;
  const cx = 70;
  const cy = 68;

  function arcPath(startAngle: number, endAngle: number, radius: number): string {
    const startRad = ((180 + startAngle) * Math.PI) / 180;
    const endRad = ((180 + endAngle) * Math.PI) / 180;
    const x1 = cx + radius * Math.cos(startRad);
    const y1 = cy + radius * Math.sin(startRad);
    const x2 = cx + radius * Math.cos(endRad);
    const y2 = cy + radius * Math.sin(endRad);
    const large = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2}`;
  }

  let color = "#34d399";
  if (thresholds) {
    if (value < thresholds.good) color = "#f87171";
    else if (value < thresholds.warn) color = "#fbbf24";
  }

  const needleRad = ((180 + angle) * Math.PI) / 180;
  const nx = cx + (r - 10) * Math.cos(needleRad);
  const ny = cy + (r - 10) * Math.sin(needleRad);

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200 hover:shadow-md"
      style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: `0 1px 3px var(--card-shadow)` }}
    >
      <h3 style={{ color: t.title }} className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 140 80" className="w-full" style={{ maxWidth: 180 }}>
          <path d={arcPath(0, 180, r)} fill="none" stroke={theme === "dark" ? "#27272a" : "#e4e4e7"} strokeWidth={10} strokeLinecap="round" />
          <path d={arcPath(0, angle, r)} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
          <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={3} fill={color} />
        </svg>
        <p style={{ color: t.title }} className="-mt-2 text-xl font-bold">
          {typeof value === "number" ? value.toFixed(1) : value}{suffix}
        </p>
      </div>
      {queryTimeMs !== undefined && queryTimeMs > 0 && (
        <p className="mt-1 text-right text-[9px] tabular-nums" style={{ color: t.subtitle, opacity: 0.5 }}>
          Query: {queryTimeMs}ms
        </p>
      )}
    </div>
  );
}
