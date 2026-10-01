"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";
import { useTheme } from "@/lib/theme-context";
import { CHART_TOKENS, type ChartTheme } from "@/lib/chart-theme";

const LIGHT_COLOR_MAP: Record<string, string> = {
  "#FAFF69": "#8e9018",
  "#34d399": "#059669",
  "#f87171": "#dc2626",
  "#818cf8": "#6366f1",
  "#60a5fa": "#2563eb",
  "#fbbf24": "#d97706",
  "#a78bfa": "#7c3aed",
  "#2dd4bf": "#0d9488",
};

function adaptColor(color: string, isLight: boolean): string {
  return isLight ? (LIGHT_COLOR_MAP[color] ?? color) : color;
}

function compactTick(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return value.toLocaleString();
}

interface TimeSeriesChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  lines: { key: string; color: string; label?: string }[];
  title: string;
  subtitle?: string;
  height?: number;
  type?: "line" | "area" | "bar";
  queryTimeMs?: number;
}

function ChartTooltip({ active, payload, label, tokens }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  tokens: ChartTheme;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: tokens.tooltipBg,
        border: `1px solid ${tokens.tooltipBorder}`,
        borderTop: `2px solid ${tokens.tooltipAccent}`,
        borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
      }}
    >
      <p style={{ fontSize: 11, color: tokens.subtitle, marginBottom: 6, fontWeight: 500 }}>{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: tokens.legend, flex: 1 }}>{entry.name}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: tokens.tooltipText, fontVariantNumeric: "tabular-nums" }}>
            {typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TimeSeriesChart({
  data,
  xKey,
  lines,
  title,
  subtitle,
  height = 300,
  type = "area",
  queryTimeMs,
}: TimeSeriesChartProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const t = CHART_TOKENS[theme];
  const adaptedLines = lines.map((l) => ({ ...l, color: adaptColor(l.color, isLight) }));

  const sharedAxis = {
    tick: { fontSize: 11, fill: t.tick, fontFamily: "inherit" },
    axisLine: { stroke: t.axisLine },
    tickLine: false as const,
  };

  const renderChart = () => {
    const margin = { top: 8, right: 12, bottom: 4, left: -4 };

    if (type === "bar") {
      return (
        <BarChart data={data} margin={margin}>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey={xKey} {...sharedAxis} />
          <YAxis {...sharedAxis} tickFormatter={compactTick} />
          <Tooltip content={<ChartTooltip tokens={t} />} cursor={{ fill: `${t.crosshair}33` }} />
          <Legend wrapperStyle={{ fontSize: 11, color: t.legend, paddingTop: 8 }} iconType="square" iconSize={8} />
          {adaptedLines.map((line) => (
            <Bar
              key={line.key}
              dataKey={line.key}
              fill={line.color}
              fillOpacity={0.85}
              radius={[4, 4, 0, 0]}
              name={line.label ?? line.key}
              animationDuration={600}
            />
          ))}
        </BarChart>
      );
    }

    if (type === "area") {
      return (
        <AreaChart data={data} margin={margin}>
          <defs>
            {adaptedLines.map((line) => (
              <linearGradient key={line.key} id={`grad-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={line.color} stopOpacity={0.25} />
                <stop offset="95%" stopColor={line.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey={xKey} {...sharedAxis} />
          <YAxis {...sharedAxis} tickFormatter={compactTick} />
          <Tooltip content={<ChartTooltip tokens={t} />} cursor={{ stroke: t.crosshair, strokeDasharray: "4 4" }} />
          <Legend wrapperStyle={{ fontSize: 11, color: t.legend, paddingTop: 8 }} iconType="plainline" iconSize={14} />
          {adaptedLines.map((line) => (
            <Area
              key={line.key}
              type="monotone"
              dataKey={line.key}
              stroke={line.color}
              fill={`url(#grad-${line.key})`}
              strokeWidth={2}
              name={line.label ?? line.key}
              animationDuration={800}
              dot={false}
              activeDot={{ r: 4, fill: line.color, stroke: t.dotFill, strokeWidth: 2 }}
            />
          ))}
        </AreaChart>
      );
    }

    return (
      <LineChart data={data} margin={margin}>
        <CartesianGrid vertical={false} stroke={t.grid} />
          <XAxis dataKey={xKey} {...sharedAxis} />
          <YAxis {...sharedAxis} tickFormatter={compactTick} />
          <Tooltip content={<ChartTooltip tokens={t} />} cursor={{ stroke: t.crosshair, strokeDasharray: "4 4" }} />
          <Legend wrapperStyle={{ fontSize: 11, color: t.legend, paddingTop: 8 }} iconType="plainline" iconSize={14} />
          {adaptedLines.map((line) => (
            <Line
            key={line.key}
            type="monotone"
            dataKey={line.key}
            stroke={line.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: line.color, stroke: t.dotFill, strokeWidth: 2 }}
            name={line.label ?? line.key}
            animationDuration={800}
          />
        ))}
      </LineChart>
    );
  };

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200 hover:shadow-md"
      style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: `0 1px 3px var(--card-shadow)` }}
    >
      <div className="mb-3">
        <h3 style={{ color: t.title }} className="text-sm font-semibold">{title}</h3>
        {subtitle && <p style={{ color: t.subtitle }} className="mt-0.5 text-xs">{subtitle}</p>}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        {renderChart()}
      </ResponsiveContainer>
      {queryTimeMs !== undefined && queryTimeMs > 0 && (
        <p className="mt-1 text-right text-[9px] tabular-nums" style={{ color: t.subtitle, opacity: 0.5 }}>
          Query: {queryTimeMs}ms
        </p>
      )}
    </div>
  );
}
