"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Activity,
  Bot,
  BrainCircuit,
  Database,
  LayoutDashboard,
  ShieldCheck,
  ShoppingBag,
  TrendingUp,
  BarChart3,
  ChevronDown,
  UserCircle,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { useUser, DEMO_USERS, type UserRole } from "@/lib/user-context";
import { useTheme } from "@/lib/theme-context";

// Nav items grouped for visual separation: home, personas, tools.
const navGroups = [
  [{ href: "/", label: "Home", icon: LayoutDashboard }],
  [
    { href: "/workspace/ceo", label: "CEO", icon: TrendingUp },
    { href: "/workspace/sales", label: "Sales", icon: BarChart3 },
    { href: "/workspace/data", label: "Data", icon: Database },
    { href: "/workspace/sre", label: "SRE", icon: Activity },
    { href: "/workspace/ai", label: "AI Engineer", icon: BrainCircuit },
  ],
  [
    { href: "/copilot", label: "AI Agents", icon: Bot },
    { href: "/admin/status", label: "Diagnostics", icon: ShieldCheck },
  ],
];

const roles: UserRole[] = ["admin", "ceo", "sales", "data", "sre", "ai"];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, googleUser, setRole } = useUser();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  if (pathname.startsWith("/auth")) return null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isSuperAdmin = googleUser?.isSuperAdmin === true;
  // Filter per group so empty groups don't render an orphan separator.
  const visibleNavGroups = navGroups
    .map((group) =>
      group.filter((item) => user.navItems.includes(item.href))
    )
    .filter((group) => group.length > 0);

  return (
    <header className="sticky top-0 z-50 border-b border-[--border] bg-[--bg]/90 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2 font-bold text-[--brand]">
          <ShoppingBag className="h-6 w-6" />
          <span className="hidden sm:inline">ClickShop Intelligence</span>
        </Link>

        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1">
            {visibleNavGroups.map((group, groupIdx) => (
              <div key={group[0].href} className="flex items-center gap-1">
                {groupIdx > 0 && <div className="mx-1.5 h-5 w-px bg-[--border]" />}
                {group.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || (href !== "/" && pathname.startsWith(href));
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        active
                          ? "bg-[--brand-dim] text-[--brand]"
                          : "text-[--muted] hover:bg-[--surface-hover] hover:text-[--fg]"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="hidden md:inline">{label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <button
            onClick={toggleTheme}
            className="rounded-lg p-1.5 text-[--muted] transition-colors hover:bg-[--surface-hover] hover:text-[--fg]"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <div className="mx-1 h-6 w-px bg-[--border]" />

          {/* User menu */}
          <div ref={ref} className="relative">
            <button
              onClick={() => setOpen(!open)}
              className="flex items-center gap-2 rounded-lg border border-[--border] bg-[--surface] px-3 py-1.5 text-sm transition-colors hover:bg-[--surface-hover]"
            >
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-zinc-950 ${user.color}`}>
                {googleUser?.name ? googleUser.name.charAt(0).toUpperCase() : user.initials}
              </span>
              <span className="hidden text-[--muted-fg] sm:inline">
                {googleUser?.name?.split(" ")[0] ?? user.label}
              </span>
              <ChevronDown className={`h-3.5 w-3.5 text-[--muted] transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
              <div className="absolute right-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-[--border] bg-[--surface-solid] shadow-2xl" style={{ boxShadow: `0 16px 48px var(--card-shadow)` }}>
                {googleUser && (
                  <div className="border-b border-[--border] px-3 py-2.5">
                    <p className="text-sm font-medium text-[--fg] truncate">{googleUser.name}</p>
                    <p className="text-[11px] text-[--muted] truncate">{googleUser.email}</p>
                  </div>
                )}

                {isSuperAdmin && (
                <div className="border-b border-[--border] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[--muted]">Switch Persona</p>
                </div>
                )}
                {(isSuperAdmin ? roles : []).map((r) => {
                  const u = DEMO_USERS[r];
                  const isActive = user.id === r;
                  return (
                    <button
                      key={r}
                      onClick={() => { setRole(r); setOpen(false); router.push("/"); }}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                        isActive ? "bg-[--surface-hover] text-[--fg]" : "text-[--muted-fg] hover:bg-[--surface-hover] hover:text-[--fg]"
                      }`}
                    >
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-zinc-950 ${u.color}`}>
                        {u.initials}
                      </span>
                      <div className="flex-1">
                        <div className="font-medium">{u.label}</div>
                        <div className="text-[11px] text-[--muted]">
                          {r === "admin" ? "Full access" : r === "ceo" ? "Executive view" : r === "sales" ? "Sales & pipeline" : r === "sre" ? "Reliability & observability" : r === "ai" ? "LLM observability & evals" : "SQL & notebooks"}
                        </div>
                      </div>
                      {isActive && <UserCircle className="h-4 w-4 text-[--brand]" />}
                    </button>
                  );
                })}

                <div className="border-t border-[--border]">
                  <button
                    onClick={() => signOut({ callbackUrl: "/auth/signin" })}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-500/5"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
