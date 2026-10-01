"use client";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { useTheme } from "@/lib/theme-context";
import { CHART_TOKENS, CH_PALETTE, type ChartTheme } from "@/lib/chart-theme";

interface DonutChartProps {
  title: string;
  subtitle?: string;
  data: { name: string; value: number }[];
  centerLabel?: string;
  centerValue?: string;
  height?: number;
  queryTimeMs?: number;
}

const LIGHT_PALETTE = ["#5c5d0e", "#4f46e5", "#059669", "#dc2626", "#2563eb", "#d97706", "#7c3aed", "#0d9488"];

function DonutTooltip({ active, payload, tokens }: {
  active?: boolean;
  payload?: { name: string; value: number; payload: { fill: string } }[];
  tokens: ChartTheme;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div
      style={{
        background: tokens.tooltipBg,
        border: `1px solid ${tokens.tooltipBorder}`,
        borderTop: `2px solid ${d.payload.fill}`,
        borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
      }}
    >
      <p style={{ fontSize: 11, color: tokens.subtitle, fontWeight: 500 }}>{d.name}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: tokens.tooltipText, fontVariantNumeric: "tabular-nums" }}>
        €{d.value.toLocaleString()}
      </p>
    </div>
  );
}

export function DonutChart({ title, subtitle, data, centerLabel, centerValue, height = 260, queryTimeMs }: DonutChartProps) {
  const { theme } = useTheme();
  const t = CHART_TOKENS[theme];
  const palette = theme === "dark" ? CH_PALETTE : LIGHT_PALETTE;

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200 hover:shadow-md"
      style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: `0 1px 3px var(--card-shadow)` }}
    >
      <div className="mb-2">
        <h3 style={{ color: t.title }} className="text-sm font-semibold">{title}</h3>
        {subtitle && <p style={{ color: t.subtitle }} className="mt-0.5 text-xs">{subtitle}</p>}
      </div>

      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="60%"
              outerRadius="85%"
              paddingAngle={2}
              dataKey="value"
              nameKey="name"
              animationDuration={800}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={palette[i % palette.length] as string} />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip tokens={t} />} />
          </PieChart>
        </ResponsiveContainer>

        {centerLabel && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <p style={{ color: t.subtitle }} className="text-[10px] font-medium uppercase tracking-wider">{centerLabel}</p>
            <p style={{ color: t.title }} className="text-lg font-bold">{centerValue}</p>
          </div>
        )}
      </div>

      <div className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.slice(0, 6).map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: palette[i % palette.length] as string }}
            />
            <span style={{ color: t.legend }} className="text-[10px]">{d.name}</span>
          </div>
        ))}
      </div>
      {queryTimeMs !== undefined && queryTimeMs > 0 && (
        <p className="mt-1 text-right text-[9px] tabular-nums" style={{ color: t.subtitle, opacity: 0.5 }}>
          Query: {queryTimeMs}ms
        </p>
      )}
    </div>
  );
}
