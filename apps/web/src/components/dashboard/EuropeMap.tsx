"use client";

import { useState, useMemo } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";
import { useTheme } from "@/lib/theme-context";
import { CHART_TOKENS } from "@/lib/chart-theme";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

interface CountryData {
  code: string;
  name: string;
  revenue: number;
  orders: number;
}

interface EuropeMapProps {
  title: string;
  subtitle?: string;
  data: CountryData[];
  queryTimeMs?: number;
}

const ISO_TO_NAME: Record<string, string> = {
  DE: "Germany", FR: "France", GB: "United Kingdom", ES: "Spain", IT: "Italy",
  NL: "Netherlands", PL: "Poland", SE: "Sweden", BE: "Belgium", AT: "Austria",
  CH: "Switzerland", PT: "Portugal", IE: "Ireland", DK: "Denmark", NO: "Norway",
  FI: "Finland", CZ: "Czechia", RO: "Romania", GR: "Greece", HU: "Hungary",
  BR: "Brazil", US: "United States of America", JP: "Japan", CA: "Canada",
  AU: "Australia", IN: "India", MX: "Mexico", MA: "Morocco",
};

const NAME_TO_ISO: Record<string, string> = {};
Object.entries(ISO_TO_NAME).forEach(([iso, name]) => { NAME_TO_ISO[name] = iso; });
NAME_TO_ISO["Czech Republic"] = "CZ";
NAME_TO_ISO["Czechia"] = "CZ";
NAME_TO_ISO["United Kingdom"] = "GB";
NAME_TO_ISO["W. Sahara"] = "MA";

const LABEL_COORDS: Record<string, [number, number]> = {
  DE: [10.4, 51.1], FR: [2.2, 46.6], GB: [-3, 54], ES: [-3.7, 40.4],
  IT: [12.5, 42.5], NL: [5.3, 52.1], PL: [19.1, 51.9], SE: [15.6, 62.0],
  BE: [4.4, 50.5], AT: [14.6, 47.5], CH: [8.2, 46.8], PT: [-8.2, 39.4],
  IE: [-7.7, 53.1], DK: [9.5, 56.3], NO: [8.5, 61.0], FI: [26.0, 64.0],
  CZ: [15.5, 49.8], RO: [25.0, 45.9], GR: [22.0, 38.5], HU: [19.5, 47.2],
  US: [-98, 39], BR: [-51, -10], JP: [138, 36], CA: [-106, 56],
  AU: [134, -25], IN: [78, 22], MX: [-102, 23], MA: [-6, 32],
};

const FLAG_COLORS: Record<string, { dark: string; light: string }> = {
  DE: { dark: "#FACC15", light: "#a16207" },   // Gold
  FR: { dark: "#3B82F6", light: "#2563eb" },   // Blue
  GB: { dark: "#DC2626", light: "#b91c1c" },   // Red
  ES: { dark: "#EAB308", light: "#ca8a04" },   // Yellow
  IT: { dark: "#22C55E", light: "#16a34a" },   // Green
  NL: { dark: "#F97316", light: "#c2410c" },   // Orange
  PL: { dark: "#F43F5E", light: "#e11d48" },   // Rose
  SE: { dark: "#60A5FA", light: "#3b82f6" },   // Light blue
  BE: { dark: "#78716C", light: "#57534e" },   // Stone (black stripe)
  AT: { dark: "#FB7185", light: "#f43f5e" },   // Pink-red
  CH: { dark: "#EF4444", light: "#dc2626" },   // Bright red
  PT: { dark: "#059669", light: "#047857" },   // Teal green
  IE: { dark: "#34D399", light: "#10b981" },   // Emerald
  DK: { dark: "#B91C1C", light: "#991b1b" },   // Deep red
  NO: { dark: "#1D4ED8", light: "#1e40af" },   // Royal blue
  FI: { dark: "#93C5FD", light: "#60a5fa" },   // Pale blue
  CZ: { dark: "#818CF8", light: "#6366f1" },   // Lavender
  RO: { dark: "#6366F1", light: "#4f46e5" },   // Indigo
  GR: { dark: "#0EA5E9", light: "#0284c7" },   // Sky blue
  HU: { dark: "#16A34A", light: "#15803d" },   // Dark green
  US: { dark: "#2563EB", light: "#1d4ed8" },   // Medium blue
  BR: { dark: "#14B8A6", light: "#0d9488" },   // Teal
  JP: { dark: "#E11D48", light: "#be123c" },   // Crimson
  CA: { dark: "#F87171", light: "#ef4444" },   // Salmon red
  AU: { dark: "#1E3A8A", light: "#1e3a8a" },   // Navy
  IN: { dark: "#EA580C", light: "#c2410c" },   // Deep saffron
  MX: { dark: "#15803D", light: "#166534" },   // Forest green
  MA: { dark: "#991B1B", light: "#7f1d1d" },   // Maroon
};

const FLAG_EMOJI: Record<string, string> = {
  DE: "🇩🇪", FR: "🇫🇷", GB: "🇬🇧", ES: "🇪🇸", IT: "🇮🇹",
  NL: "🇳🇱", PL: "🇵🇱", SE: "🇸🇪", BE: "🇧🇪", AT: "🇦🇹",
  CH: "🇨🇭", PT: "🇵🇹", IE: "🇮🇪", DK: "🇩🇰", NO: "🇳🇴",
  FI: "🇫🇮", CZ: "🇨🇿", RO: "🇷🇴", GR: "🇬🇷", HU: "🇭🇺",
  US: "🇺🇸", BR: "🇧🇷", JP: "🇯🇵", CA: "🇨🇦", AU: "🇦🇺",
  IN: "🇮🇳", MX: "🇲🇽", MA: "🇲🇦",
};

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`;
  return `€${n}`;
}

export function EuropeMap({ title, subtitle, data, queryTimeMs }: EuropeMapProps) {
  const { theme } = useTheme();
  const t = CHART_TOKENS[theme];
  const [hover, setHover] = useState<string | null>(null);
  const isLight = theme === "light";

  const colorMap = useMemo(() => {
    const m = new Map<string, string>();
    data.forEach((d) => {
      const flag = FLAG_COLORS[d.code];
      if (flag) {
        m.set(d.code, isLight ? flag.light : flag.dark);
      } else {
        m.set(d.code, isLight ? "#6b7280" : "#9ca3af");
      }
    });
    return m;
  }, [data, isLight]);

  const dataByName = useMemo(() => {
    const m = new Map<string, CountryData>();
    data.forEach((d) => {
      const name = ISO_TO_NAME[d.code];
      if (name) m.set(name, d);
    });
    m.set("W. Sahara", m.get("Morocco")!);
    return m;
  }, [data]);

  function getCountryColor(geoName: string): string {
    const d = dataByName.get(geoName);
    if (!d) return isLight ? "#f0f0f0" : "#1f1f23";
    return colorMap.get(d.code) ?? (isLight ? "#f0f0f0" : "#1f1f23");
  }

  const hoverData = hover ? dataByName.get(hover) : null;
  const countriesWithData = data.filter((d) => LABEL_COORDS[d.code]);

  return (
    <div
      className="rounded-xl p-4 transition-all duration-200 hover:shadow-md"
      style={{ background: t.cardBg, border: `1px solid ${t.cardBorder}`, boxShadow: `0 1px 3px var(--card-shadow)` }}
    >
      <div className="mb-2">
        <h3 style={{ color: t.title }} className="text-sm font-semibold">{title}</h3>
        {subtitle && <p style={{ color: t.subtitle }} className="mt-0.5 text-xs">{subtitle}</p>}
      </div>

      <div className="relative" style={{ height: 380 }}>
        <ComposableMap
          projection="geoEqualEarth"
          projectionConfig={{ scale: 140 }}
          width={700}
          height={380}
          style={{ width: "100%", height: "100%" }}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const name = geo.properties.name as string;
                const isMoroccoTerritory = name === "W. Sahara";
                const displayName = isMoroccoTerritory ? "Morocco" : name;
                const hasData = dataByName.has(displayName);
                const isHovered = hover === displayName;
                const fillColor = isHovered && hasData
                  ? (isLight ? "#18181b" : "#ffffff")
                  : getCountryColor(displayName);
                const isMoroccoBorder = isMoroccoTerritory || name === "Morocco";
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fillColor}
                    stroke={isMoroccoBorder ? fillColor : (isLight ? "#d4d4d8" : "#27272a")}
                    strokeWidth={isMoroccoBorder ? 0 : 0.4}
                    style={{
                      default: {
                        outline: "none",
                        opacity: hover && !isHovered ? (hasData ? 0.7 : 0.3) : 1,
                        transition: "all 200ms",
                      },
                      hover: { outline: "none", cursor: hasData ? "pointer" : "default" },
                      pressed: { outline: "none" },
                    }}
                    onMouseEnter={() => hasData && setHover(displayName)}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              })
            }
          </Geographies>

          {countriesWithData.map((d) => {
            const coords = LABEL_COORDS[d.code];
            if (!coords) return null;
            const color = colorMap.get(d.code) ?? "#888";
            return (
              <Marker key={d.code} coordinates={coords}>
                <text
                  textAnchor="middle"
                  y={-7}
                  style={{
                    fontSize: 7,
                    fontWeight: 700,
                    fill: isLight ? "#18181b" : "#ffffff",
                    paintOrder: "stroke",
                    stroke: isLight ? "#ffffff" : "#0c0d0e",
                    strokeWidth: 2.5,
                    strokeLinejoin: "round",
                  }}
                >
                  {FLAG_EMOJI[d.code] ? `${FLAG_EMOJI[d.code]} ` : ""}{formatCompact(d.revenue)}
                </text>
                <circle r={2} fill={color} stroke={isLight ? "#ffffff" : "#0c0d0e"} strokeWidth={0.8} />
              </Marker>
            );
          })}
        </ComposableMap>

        {hover && hoverData && (
          <div
            className="pointer-events-none absolute right-4 top-4 z-10 rounded-lg px-4 py-3"
            style={{
              background: t.tooltipBg,
              border: `1px solid ${t.tooltipBorder}`,
              borderTop: `3px solid ${colorMap.get(hoverData.code) ?? t.tooltipAccent}`,
              boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
            }}
          >
            <p style={{ color: t.subtitle, fontSize: 11, fontWeight: 500 }}>{hoverData ? (FLAG_EMOJI[hoverData.code] ?? "") + " " : ""}{hover}</p>
            <p style={{ color: t.tooltipText, fontSize: 18, fontWeight: 700 }}>
              €{hoverData.revenue.toLocaleString()}
            </p>
            <p style={{ color: t.subtitle, fontSize: 11 }}>
              {hoverData.orders.toLocaleString()} orders
            </p>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {countriesWithData
          .sort((a, b) => b.revenue - a.revenue)
          .map((d) => (
            <div key={d.code} className="flex items-center gap-1.5">
              <span className="text-xs">{FLAG_EMOJI[d.code] ?? ""}</span>
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: colorMap.get(d.code) }}
              />
              <span style={{ color: t.legend }} className="text-[10px]">
                {d.name} ({formatCompact(d.revenue)})
              </span>
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
