"use client";

import { useEffect } from "react";
import { useUser } from "@/lib/user-context";
import { sendPresenceHeartbeat } from "@/lib/presence";

// Heartbeats this tab's anonymous session id to /api/presence every 30s so
// Stop confirmations on the Diagnostics page can warn about other active users.
export function PresenceTracker() {
  const { user, googleUser } = useUser();
  const label = googleUser?.name || user.label;

  useEffect(() => {
    const beat = () => { sendPresenceHeartbeat(label).catch(() => {}); };
    beat();
    const id = setInterval(beat, 30_000);
    return () => clearInterval(id);
  }, [label]);

  return null;
}
