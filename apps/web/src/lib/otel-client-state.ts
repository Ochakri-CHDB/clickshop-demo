// Client-side singleton driving the OTel demo sender.
// Same pattern as gen-client-state: the loop lives at module level so it
// survives client-side navigation (SPA). Each tick asks the server to emit
// one batch of traces/logs/metrics/session-replay events.
//
// The EC2 collector container is ALWAYS ON (restart: unless-stopped); it is
// never stopped from here. Start/Stop only controls the synthetic demo batch
// loop. Start also asks /api/otel/collector to `docker start` the container
// as a recovery path in case it was stopped manually.

type OtelListener = () => void;

export type CollectorStatus =
  | "unknown"
  | "running"
  | "stopped"
  | "starting"
  | "stopping";

interface OtelClientState {
  running: boolean;
  collectorStatus: CollectorStatus;
  startedAt: number | null;
  totalTraces: number;
  totalLogs: number;
  totalMetrics: number;
  totalSessions: number;
  errors: number;
  lastError: string | null;
  intervalId: ReturnType<typeof setInterval> | null;
  listeners: Set<OtelListener>;
}

const STORAGE_KEY = "clickshop.otel-sender.running";

const state: OtelClientState = {
  running: false,
  collectorStatus: "unknown",
  startedAt: null,
  totalTraces: 0,
  totalLogs: 0,
  totalMetrics: 0,
  totalSessions: 0,
  errors: 0,
  lastError: null,
  intervalId: null,
  listeners: new Set(),
};

function notify() {
  state.listeners.forEach((fn) => fn());
}

async function sendBatch() {
  try {
    const res = await fetch("/api/otel/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "batch" }),
    });
    const data = await res.json();
    state.totalTraces += data.traces ?? 0;
    state.totalLogs += data.logs ?? 0;
    state.totalMetrics += data.metrics ?? 0;
    state.totalSessions += data.sessions ?? 0;
    if (data.error) {
      state.errors++;
      state.lastError = data.error;
    } else {
      state.lastError = null;
    }
  } catch (err) {
    state.errors++;
    state.lastError = (err as Error).message;
  }
  notify();
}

async function setCollector(action: "start" | "stop"): Promise<boolean> {
  const res = await fetch("/api/otel/collector", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `Collector ${action} failed`);
  return data.status === "running";
}

// The container starts fast but the OTLP endpoint needs a few seconds to
// accept traffic. Poll /api/otel/test (which probes the OTLP port) so the
// batch loop only starts once data can actually flow.
async function waitForCollectorUp(timeoutMs = 40_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch("/api/otel/test");
      const data = await res.json();
      if (data.collectorUp) return true;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function beginBatchLoop() {
  state.running = true;
  state.startedAt = Date.now();
  state.totalTraces = 0;
  state.totalLogs = 0;
  state.totalMetrics = 0;
  state.totalSessions = 0;
  state.errors = 0;
  state.lastError = null;
  notify();
  sendBatch();
  state.intervalId = setInterval(sendBatch, 2000);
}

export async function startOtelSending() {
  if (state.running || state.collectorStatus === "starting") return;
  state.collectorStatus = "starting";
  state.lastError = null;
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
  notify();
  try {
    await setCollector("start");
    const up = await waitForCollectorUp();
    if (!up) throw new Error("Collector started but OTLP endpoint not reachable");
    state.collectorStatus = "running";
    beginBatchLoop();
  } catch (err) {
    state.collectorStatus = "unknown";
    state.errors++;
    state.lastError = (err as Error).message;
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    notify();
    refreshCollectorStatus();
  }
}

export async function stopOtelSending() {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.running = false;
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  // The collector container stays up: only the demo batch loop stops.
  notify();
  refreshCollectorStatus();
}

// Reads the real container state from the EC2 host so the Diagnostics card
// reflects reality on page load (collector may have been toggled elsewhere).
export async function refreshCollectorStatus() {
  if (state.collectorStatus === "starting" || state.collectorStatus === "stopping") return;
  try {
    const res = await fetch("/api/otel/collector");
    const data = await res.json();
    // Re-read after the await: a start/stop may have begun in the meantime.
    const current = state.collectorStatus as CollectorStatus;
    if (current === "starting" || current === "stopping") return;
    if (data.status === "running" || data.status === "stopped") {
      state.collectorStatus = data.status;
    } else {
      state.collectorStatus = "unknown";
    }
  } catch {
    state.collectorStatus = "unknown";
  }
  notify();
}

// Resume after a full page reload (F5) if the user had sending enabled.
export function resumeOtelIfIntended() {
  if (state.running || state.collectorStatus === "starting") return;
  try {
    if (localStorage.getItem(STORAGE_KEY) === "1") startOtelSending();
  } catch { /* ignore */ }
}

export function getOtelSnapshot() {
  return {
    running: state.running,
    collectorStatus: state.collectorStatus,
    uptimeMs: state.startedAt && state.running ? Date.now() - state.startedAt : 0,
    totalTraces: state.totalTraces,
    totalLogs: state.totalLogs,
    totalMetrics: state.totalMetrics,
    totalSessions: state.totalSessions,
    errors: state.errors,
    lastError: state.lastError,
  };
}

export function subscribeOtel(listener: OtelListener): () => void {
  state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
}
