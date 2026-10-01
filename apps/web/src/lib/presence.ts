// Client helpers for the anonymous presence system (/api/presence).
// Each browser tab gets a uuid in sessionStorage; PresenceTracker heartbeats
// it every 30s and Stop confirmations query who else is currently active.

const SESSION_KEY = "clickshop_presence_id";

export function getPresenceSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export interface PresenceSession {
  session_id: string;
  user_label: string;
  last_seen: string;
}

export interface OtherSessions {
  count: number;
  labels: string[];
}

// Active sessions excluding the current tab.
export async function fetchOtherActiveSessions(): Promise<OtherSessions> {
  const self = getPresenceSessionId();
  const res = await fetch("/api/presence", { cache: "no-store" });
  if (!res.ok) throw new Error(`presence fetch failed (${res.status})`);
  const data = (await res.json()) as { sessions?: PresenceSession[] };
  const others = (data.sessions ?? []).filter((s) => s.session_id !== self);
  const labels = Array.from(new Set(others.map((s) => s.user_label).filter(Boolean)));
  return { count: others.length, labels };
}

export async function sendPresenceHeartbeat(userLabel: string): Promise<void> {
  const sessionId = getPresenceSessionId();
  if (!sessionId) return;
  await fetch("/api/presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, userLabel }),
  });
}
