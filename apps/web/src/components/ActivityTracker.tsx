"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

export function ActivityTracker() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const loginTracked = useRef(false);
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user?.email) return;

    if (!loginTracked.current) {
      loginTracked.current = true;
      fetch("/api/activity/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email: session.user.email,
          user_name: session.user.name ?? "",
          event_type: "login",
          page_path: pathname,
        }),
      }).catch(() => {});
    }
  }, [session, pathname]);

  useEffect(() => {
    if (!session?.user?.email) return;
    if (pathname === lastPath.current) return;
    if (pathname.startsWith("/auth")) return;

    lastPath.current = pathname;

    fetch("/api/activity/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_email: session.user.email,
        user_name: session.user.name ?? "",
        event_type: "page_view",
        page_path: pathname,
      }),
    }).catch(() => {});
  }, [pathname, session]);

  return null;
}
