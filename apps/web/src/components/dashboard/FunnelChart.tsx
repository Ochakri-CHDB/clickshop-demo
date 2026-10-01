"use client";

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import { useTheme } from "@/lib/theme-context";
import { CHART_TOKENS, type ChartTheme } from "@/lib/chart-theme";

interface FunnelChartProps {
  title: string;
  subtitle?: string;
  data: { step: string; count: number }[];
  height?: number;
  queryTimeMs?: number;
}

const FUNNEL_COLORS = ["#FAFF69", "#e2e54c", "#b8bb2f", "#8e9018", "#717310"];

function FunnelTooltip({ active, payload, tokens }: {
  active?: boolean;
  payload?: { value: number; payload: { step: string } }[];
  tokens: ChartTheme;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
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
      <p style={{ fontSize: 11, color: tokens.subtitle, marginBottom: 4, fontWeight: 500 }}>{d.payload.step}</p>
      <p style={{ fontSize: 13, fontWeight: 600, color: tokens.tooltipText, fontVariantNumeric: "tabular-nums" }}>
        {new Intl.NumberFormat("en-US").format(d.value)}
      </p>
    </div>
  );
}

export function FunnelChart({ title, subtitle, data, height = 300, queryTimeMs }: FunnelChartProps) {
  const { theme } = useTheme();
  const t = CHART_TOKENS[theme];

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
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 80 }}>
          <CartesianGrid horizontal={false} stroke={t.grid} />
          <XAxis
            type="number"
            tick={{ fontSize: 11, fill: t.tick, fontFamily: "inherit" }}
            axisLine={{ stroke: t.axisLine }}
            tickLine={false}
          />
          <YAxis
            dataKey="step"
            type="category"
            tick={{ fontSize: 11, fill: t.legend, fontFamily: "inherit" }}
            axisLine={false}
            tickLine={false}
            width={90}
          />
          <Tooltip content={<FunnelTooltip tokens={t} />} cursor={{ fill: `${t.crosshair}22` }} />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} animationDuration={600}>
            {data.map((_, i) => (
              <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} fillOpacity={0.9} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {queryTimeMs !== undefined && queryTimeMs > 0 && (
        <p className="mt-1 text-right text-[9px] tabular-nums" style={{ color: t.subtitle, opacity: 0.5 }}>
          Query: {queryTimeMs}ms
        </p>
      )}
    </div>
  );
}
