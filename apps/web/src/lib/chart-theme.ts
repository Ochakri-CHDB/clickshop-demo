export const CH_PALETTE = [
  "#FAFF69", // brand yellow
  "#818cf8", // indigo
  "#34d399", // emerald
  "#f87171", // red
  "#60a5fa", // blue
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#2dd4bf", // teal
] as const;

export const CHART_TOKENS = {
  dark: {
    grid: "#1f1f23",
    axisLine: "#27272a",
    tick: "#71717a",
    tooltipBg: "#18181b",
    tooltipBorder: "#27272a",
    tooltipText: "#e4e4e7",
    tooltipAccent: "#FAFF69",
    legend: "#a1a1aa",
    dotFill: "#0c0d0e",
    crosshair: "#3f3f46",
    cardBg: "rgba(24,24,27,0.8)",
    cardBorder: "#27272a",
    title: "#d4d4d8",
    subtitle: "#71717a",
  },
  light: {
    grid: "#f0f0f0",
    axisLine: "#e4e4e7",
    tick: "#71717a",
    tooltipBg: "#ffffff",
    tooltipBorder: "#e4e4e7",
    tooltipText: "#27272a",
    tooltipAccent: "#5c5d0e",
    legend: "#52525b",
    dotFill: "#ffffff",
    crosshair: "#d4d4d8",
    cardBg: "#ffffff",
    cardBorder: "#e4e4e7",
    title: "#27272a",
    subtitle: "#71717a",
  },
} as const;

export type ChartTheme = {
  grid: string;
  axisLine: string;
  tick: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipAccent: string;
  legend: string;
  dotFill: string;
  crosshair: string;
  cardBg: string;
  cardBorder: string;
  title: string;
  subtitle: string;
};
