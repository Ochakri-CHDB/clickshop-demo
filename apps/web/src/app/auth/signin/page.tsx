"use client";

import { signIn } from "next-auth/react";
import { ShoppingBag, Sun, Moon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useTheme } from "@/lib/theme-context";

const C = {
  dark: {
    bg: "#0a0a0a",
    accent: "#FADB14",
    accentHover: "#FFE44D",
    glow: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(250,220,50,0.06) 0%, transparent 70%)",
    grid: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
    gridOpacity: 0.03,
    fg: "#ffffff",
    muted: "#a1a1aa",
    subtle: "#3f3f46",
    inputBg: "rgba(24,24,27,0.8)",
    inputBorder: "#27272a",
    chLabel: "#FADB14",
    tagline: "#52525b",
  },
  light: {
    bg: "#f8f8f6",
    accent: "#FADB14",
    accentHover: "#FFE44D",
    glow: "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(0,0,0,0.02) 0%, transparent 70%)",
    grid: "linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
    gridOpacity: 0.5,
    fg: "#0a0a0a",
    muted: "#71717a",
    subtle: "#a1a1aa",
    inputBg: "#ffffff",
    inputBorder: "#e4e4e7",
    chLabel: "#0a0a0a",
    tagline: "#a1a1aa",
  },
};

type StepStatus = "pending" | "loading" | "done" | "error" | "warning";
type ProvisionStep = { label: string; status: StepStatus; detail?: string };

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const error = searchParams.get("error");
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";
  const c = dark ? C.dark : C.light;

  const [email, setEmail] = useState("admin@clickshop.io");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(false);
    setLoading(true);
    const res = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      callbackUrl,
      redirect: false,
    });
    if (res?.error || !res?.ok) {
      setAuthError(true);
      setLoading(false);
      return;
    }
    window.location.href = res.url || callbackUrl;
  };

  const focusBorder = "#FADB14";
  const focusShadow = "0 0 0 1px rgba(250,219,20,0.5)";

  return (
    <div
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden transition-colors duration-300"
      style={{ background: c.bg }}
    >
      <button
        onClick={toggleTheme}
        className="absolute right-5 top-5 z-20 flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
        style={{
          border: `1px solid ${c.inputBorder}`,
          background: dark ? "rgba(24,24,27,0.6)" : "rgba(255,255,255,0.8)",
          color: c.muted,
        }}
        title={dark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="pointer-events-none absolute inset-0" style={{ background: c.glow }} />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ opacity: c.gridOpacity, backgroundImage: c.grid, backgroundSize: "60px 60px" }}
      />

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="mb-10 text-center">
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: dark ? "rgba(250,219,20,0.10)" : "rgba(250,219,20,0.20)" }}
          >
            <ShoppingBag className="h-8 w-8" style={{ color: "#FADB14" }} />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: c.fg }}>
            ClickShop
          </h1>
          <h2 className="mt-1 text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: c.fg }}>
            Intelligence
          </h2>
          <p className="mt-4 text-base leading-relaxed" style={{ color: c.muted }}>
            Real-time retail analytics & AI agents
            <br />
            powered by the unified{" "}
            <span className="font-semibold" style={{ color: c.chLabel }}>ClickHouse</span>{" "}
            platform
          </p>
          <p className="mt-2 text-sm font-medium tracking-wide" style={{ color: c.tagline }}>
            The leading database for AI
          </p>
        </div>

        {(error || authError) && (
          <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3 text-center text-sm text-red-400">
            Invalid email or password.
          </div>
        )}

        {(
          <div className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setAuthError(false); }}
                placeholder="you@company.com"
                required
                autoFocus
                className="w-full rounded-lg px-4 py-3.5 text-sm transition-colors focus:outline-none"
                style={{
                  border: `1px solid ${c.inputBorder}`,
                  background: c.inputBg,
                  color: c.fg,
                }}
                onFocus={(e) => { e.target.style.borderColor = focusBorder; e.target.style.boxShadow = focusShadow; }}
                onBlur={(e) => { e.target.style.borderColor = c.inputBorder; e.target.style.boxShadow = "none"; }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setAuthError(false); }}
                placeholder="Demo password"
                required
                className="w-full rounded-lg px-4 py-3.5 text-sm transition-colors focus:outline-none"
                style={{
                  border: `1px solid ${c.inputBorder}`,
                  background: c.inputBg,
                  color: c.fg,
                }}
                onFocus={(e) => { e.target.style.borderColor = focusBorder; e.target.style.boxShadow = focusShadow; }}
                onBlur={(e) => { e.target.style.borderColor = c.inputBorder; e.target.style.boxShadow = "none"; }}
              />
              <button
                type="submit"
                disabled={loading || !email.trim() || !password}
                className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-sm font-semibold transition-all disabled:opacity-40"
                style={{ background: c.accent, color: "#0a0a0a" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = c.accentHover; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = c.accent; }}
              >
                {loading && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0a0a0a] border-t-transparent" />
                )}
                Sign in
              </button>
            </form>

            <p className="text-center text-xs" style={{ color: c.subtle }}>
              Use the demo password printed by install.sh
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[--bg]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-[#FADB14]" />
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
