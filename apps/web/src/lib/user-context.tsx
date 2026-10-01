"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useSession } from "next-auth/react";

export type UserRole = "admin" | "ceo" | "sales" | "data" | "sre" | "ai";

export interface DemoUser {
  id: UserRole;
  label: string;
  initials: string;
  color: string;
  navItems: string[];
  agents: string[];
  chatEmail: string;
}

export const DEMO_USERS: Record<UserRole, DemoUser> = {
  admin: {
    id: "admin",
    label: "Admin",
    initials: "AD",
    color: "bg-violet-500",
    navItems: ["/", "/workspace/ceo", "/workspace/sales", "/workspace/data", "/copilot", "/workspace/sre", "/workspace/ai", "/admin/status"],
    agents: ["general", "ceo", "sales"],
    chatEmail: "admin@clickshop.io",
  },
  ceo: {
    id: "ceo",
    label: "CEO",
    initials: "CEO",
    color: "bg-brand-400",
    navItems: ["/", "/workspace/ceo", "/copilot"],
    agents: ["ceo"],
    chatEmail: "ceo@clickshop.io",
  },
  sales: {
    id: "sales",
    label: "Sales Manager",
    initials: "SM",
    color: "bg-emerald-500",
    navItems: ["/", "/workspace/sales", "/copilot"],
    agents: ["sales"],
    chatEmail: "sales@clickshop.io",
  },
  data: {
    id: "data",
    label: "Data Analyst",
    initials: "DA",
    color: "bg-blue-500",
    navItems: ["/", "/workspace/data", "/copilot"],
    agents: ["general"],
    chatEmail: "data@clickshop.io",
  },
  sre: {
    id: "sre",
    label: "SRE",
    initials: "SRE",
    color: "bg-rose-500",
    navItems: ["/", "/workspace/sre", "/copilot"],
    agents: ["sre"],
    chatEmail: "sre@clickshop.io",
  },
  ai: {
    id: "ai",
    label: "AI Engineer",
    initials: "AI",
    color: "bg-sky-500",
    navItems: ["/", "/workspace/ai", "/copilot"],
    agents: ["ai"],
    chatEmail: "ai-engineer@clickshop.io",
  },
};

function roleFromEmail(email: string): UserRole {
  const local = email.split("@")[0];
  if (local === "ai-engineer") return "ai";
  if (local === "ceo" || local === "sales" || local === "data" || local === "sre") return local;
  // Other accounts (ALLOWED_EMAIL_DOMAIN) get the read-only Data Analyst view.
  return "data";
}

export interface GoogleUser {
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

interface UserContextValue {
  user: DemoUser;
  googleUser: GoogleUser | null;
  setRole: (role: UserRole) => void;
}

const UserContext = createContext<UserContextValue>({
  user: DEMO_USERS.admin,
  googleUser: null,
  setRole: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [role, setRoleState] = useState<UserRole>("admin");

  const googleUser: GoogleUser | null = session?.user
    ? {
        email: session.user.email ?? "",
        name: session.user.name ?? "",
        isSuperAdmin: (session.user as { isAdmin?: boolean }).isAdmin === true,
      }
    : null;

  // Mirror the persona into a cookie so server-side API spans can attribute
  // requests to a user (read by lib/api-telemetry.ts).
  const syncUserCookie = (r: UserRole) => {
    try {
      document.cookie = `clickshop_user=${r}; path=/; max-age=31536000; samesite=lax`;
    } catch { /* noop */ }
  };

  // Persona accounts are pinned to their own workspace; only the admin can
  // switch personas from the user menu.
  const sessionEmail = session?.user?.email ?? "";
  const lockedRole: UserRole | null = googleUser && !googleUser.isSuperAdmin ? roleFromEmail(sessionEmail) : null;

  useEffect(() => {
    if (lockedRole) {
      setRoleState(lockedRole);
      syncUserCookie(lockedRole);
      return;
    }
    const saved = localStorage.getItem("clickshop_user") as UserRole | null;
    if (saved && DEMO_USERS[saved]) setRoleState(saved);
    syncUserCookie(saved && DEMO_USERS[saved] ? saved : "admin");
  }, [lockedRole]);

  const setRole = (r: UserRole) => {
    if (lockedRole) return;
    setRoleState(r);
    localStorage.setItem("clickshop_user", r);
    localStorage.setItem("clickshop_session", `s-${r}-${Date.now()}`);
    syncUserCookie(r);
  };

  const effectiveUser = DEMO_USERS[lockedRole ?? role];

  return (
    <UserContext.Provider value={{ user: effectiveUser, googleUser, setRole }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
