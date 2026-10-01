"use client";

import { useState } from "react";
import { useTheme } from "@/lib/theme-context";
import { CHART_TOKENS } from "@/lib/chart-theme";

interface HeatmapChartProps {
  title: string;
  subtitle?: string;
  data: { day: string; hour: number; value: number }[];
  valueLabel?: string;
  queryTimeMs?: number;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function HeatmapChart({ title, subtitle, data, valueLabel = "orders", queryTimeMs }: HeatmapChartProps) {
  const { theme } = useTheme();
  const t = CHART_TOKENS[theme];
  const [hover, setHover] = useState<{ day: string; hour: number; value: number } | null>(null);

  const lookup = new Map(data.map((d) => [`${d.day}-${d.hour}`, d.value]));
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  function cellColor(val: number): string {
    if (val === 0) return theme === "dark" ? "#18181b" : "#f4f4f5";
    const intensity = Math.max(0.12, val / maxVal);
    if (theme === "dark") {
      const r = Math.round(38 + (250 - 38) * intensity);
      const g = Math.round(38 + (255 - 38) * intensity);
      const b = Math.round(43 + (105 - 43) * intensity);
      return `rgb(${r},${g},${b})`;
    }
    const base = 244;
    const r = Math.round(base - (base - 92) * intensity);
    const g = Math.round(base - (base - 93) * intensity);
    const bv = Math.round(base - (base - 14) * intensity);
    return `rgb(${r},${g},${bv})`;
  }

  const cellSize = 18;
  const gap = 3;
  const labelW = 32;
  const labelH = 20;
  const gridW = HOURS.length * (cellSize + gap);
  const gridH = DAYS.length * (cellSize + gap);
  const svgW = labelW + gridW + 4;
  const svgH = labelH + gridH + 4;

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200 hover:shadow-md"
      style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: `0 1px 3px var(--card-shadow)` }}
    >
      <div className="mb-3">
        <h3 style={{ color: t.title }} className="text-sm font-semibold">{title}</h3>
        {subtitle && <p style={{ color: t.subtitle }} className="mt-0.5 text-xs">{subtitle}</p>}
      </div>

      <div className="overflow-x-auto">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="mx-auto"
        >
          {DAYS.map((day, di) => (
            <text
              key={`label-${day}`}
              x={labelW - 4}
              y={labelH + di * (cellSize + gap) + cellSize / 2 + 4}
              textAnchor="end"
              style={{ fontSize: 10, fill: t.tick, fontFamily: "inherit" }}
            >
              {day}
            </text>
          ))}

          {HOURS.filter((h) => h % 3 === 0).map((h) => (
            <text
              key={`hour-${h}`}
              x={labelW + h * (cellSize + gap) + cellSize / 2}
              y={labelH - 6}
              textAnchor="middle"
              style={{ fontSize: 9, fill: t.tick, fontFamily: "inherit" }}
            >
              {`${h}h`}
            </text>
          ))}

          {DAYS.map((day, di) =>
            HOURS.map((hour) => {
              const val = lookup.get(`${day}-${hour}`) ?? 0;
              const cx = labelW + hour * (cellSize + gap);
              const cy = labelH + di * (cellSize + gap);
              const isHovered = hover?.day === day && hover?.hour === hour;

              return (
                <rect
                  key={`${day}-${hour}`}
                  x={cx}
                  y={cy}
                  width={cellSize}
                  height={cellSize}
                  rx={3}
                  fill={cellColor(val)}
                  stroke={isHovered ? (theme === "dark" ? "#FAFF69" : "#5c5d0e") : "none"}
                  strokeWidth={isHovered ? 2 : 0}
                  opacity={hover && !isHovered ? 0.4 : 1}
                  className="cursor-pointer"
                  style={{ transition: "opacity 150ms, fill 150ms" }}
                  onMouseEnter={() => setHover({ day, hour, value: val })}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })
          )}
        </svg>
      </div>

      <div className="mt-3 flex items-center justify-between">
        {hover ? (
          <span style={{ color: t.tooltipText }} className="text-xs font-medium">
            {hover.day} {String(hover.hour).padStart(2, "0")}:00 — {hover.value.toLocaleString()} {valueLabel}
          </span>
        ) : (
          <span style={{ color: t.subtitle }} className="text-xs">
            Hover for details
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <span style={{ color: t.subtitle }} className="text-[10px]">Less</span>
          <div className="h-3 w-20 rounded" style={{
            background: theme === "dark"
              ? "linear-gradient(90deg, #18181b, #FAFF69)"
              : "linear-gradient(90deg, #f4f4f5, #5c5d0e)",
          }} />
          <span style={{ color: t.subtitle }} className="text-[10px]">More</span>
        </div>
      </div>
      {queryTimeMs !== undefined && queryTimeMs > 0 && (
        <p className="mt-1 text-right text-[9px] tabular-nums" style={{ color: t.subtitle, opacity: 0.5 }}>
          Query: {queryTimeMs}ms
        </p>
      )}
    </div>
  );
}
