import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fefff0",
          100: "#fdffe1",
          200: "#fbffb8",
          300: "#f9ff8c",
          400: "#FAFF69",
          500: "#e2e54c",
          600: "#b8bb2f",
          700: "#8e9018",
          800: "#717310",
          900: "#5c5d0e",
          950: "#31320a",
        },
        surface: {
          50: "#18181b",
          100: "#1c1c1f",
          200: "#27272a",
          300: "#2a2a2d",
          400: "#3f3f46",
          500: "#52525b",
          600: "#71717a",
          700: "#a1a1aa",
          800: "#d4d4d8",
          900: "#e4e4e7",
          950: "#fafafa",
        },
      },
      backgroundImage: {
        "ch-gradient": "linear-gradient(135deg, #0C0D0E 0%, #161517 50%, #1a1a1f 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
