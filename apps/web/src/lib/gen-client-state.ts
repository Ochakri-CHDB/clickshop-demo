type GenListener = () => void;

interface GenClientState {
  running: boolean;
  target: "clickhouse" | "postgres" | "both";
  multiplier: number;
  startedAt: number | null;
  totalRows: number;
  lastRowsPerSec: number;
  errors: number;
  lastError: string | null;
  intervalId: ReturnType<typeof setInterval> | null;
  listeners: Set<GenListener>;
}

const state: GenClientState = {
  running: false,
  target: "both",
  multiplier: 1,
  startedAt: null,
  totalRows: 0,
  lastRowsPerSec: 0,
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
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "batch", target: state.target, batchMultiplier: state.multiplier }),
    });
    const data = await res.json();
    const rows = (data.chRows ?? 0) + (data.pgRows ?? 0);
    state.totalRows += rows;
    state.lastRowsPerSec = rows;
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

export function startGenerator(target: GenClientState["target"], multiplier: number) {
  if (state.running) return;
  state.running = true;
  state.target = target;
  state.multiplier = multiplier;
  state.startedAt = Date.now();
  state.totalRows = 0;
  state.lastRowsPerSec = 0;
  state.errors = 0;
  state.lastError = null;
  notify();
  sendBatch();
  state.intervalId = setInterval(sendBatch, 2000);
}

export function stopGenerator() {
  state.running = false;
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  notify();
}

export function getGenSnapshot() {
  return {
    running: state.running,
    target: state.target,
    multiplier: state.multiplier,
    totalRows: state.totalRows,
    rowsPerSec: state.lastRowsPerSec,
    uptimeMs: state.startedAt && state.running ? Date.now() - state.startedAt : 0,
    errors: state.errors,
    lastError: state.lastError,
  };
}

export function subscribeGen(listener: GenListener): () => void {
  state.listeners.add(listener);
  return () => { state.listeners.delete(listener); };
}
