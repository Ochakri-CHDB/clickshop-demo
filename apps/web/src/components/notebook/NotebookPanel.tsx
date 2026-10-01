"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Play,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  Code2,
  Package,
  Terminal,
  Database,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Save,
  FolderOpen,
  Download,
  X,
} from "lucide-react";
import { CodeEditor } from "@/components/editor/CodeEditor";

interface CapturedQuery {
  sql: string;
  durationMs: number;
  rowCount: number;
}

interface Cell {
  id: string;
  code: string;
  output: string;
  outputType: "text" | "table" | "error";
  tableData?: { columns: string[]; rows: Record<string, unknown>[] };
  queries: CapturedQuery[];
  running: boolean;
  showQueries: boolean;
}

type PyodideInstance = {
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackagesFromImports: (code: string) => Promise<void>;
  globals: { get: (name: string) => unknown };
};

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<PyodideInstance>;
  }
}

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v0.26.1/full/";

const EXAMPLE_CELLS = [
  `# ── Lazy DataStore — nothing executes until .collect() ────
from chdb import DataStore

ds = (DataStore
      .table("gold_revenue_daily")
      .filter("dt >= today() - 7")
      .select("dt", "country", "category", "orders", "revenue")
      .sort_values("revenue", ascending=False)
      .head(200))

# Nothing has executed yet — inspect the generated SQL:
print("Pending query plan:")
print(repr(ds))
print()

# .collect() compiles to SQL, runs on ClickHouse, returns a DataFrame:
df = ds.collect()
print(f"Result: {df.shape[0]} rows × {df.shape[1]} columns\\n")
print(df.head(10).to_string(index=False))`,
  `# ── Aggregate with DataStore, then train a model ──────────
from chdb import DataStore
from sklearn.linear_model import LinearRegression
import numpy as np

daily = (DataStore
         .table("gold_revenue_daily")
         .filter("dt >= today() - 7")
         .group_by("dt")
         .agg(orders="sum(orders)", revenue="sum(revenue)")
         .sort_values("dt")
         .collect())

daily["day_idx"] = range(len(daily))

model = LinearRegression()
model.fit(daily[["day_idx"]], daily["revenue"].astype(float))
r2 = model.score(daily[["day_idx"]], daily["revenue"].astype(float))
daily["predicted"] = model.predict(daily[["day_idx"]])

print(f"Model: Revenue ~ Day  (R² = {r2:.4f})")
print(f"  Slope     : €{model.coef_[0]:>12,.2f} / day")
print(f"  Intercept : €{model.intercept_:>12,.2f}\\n")
print(daily[["dt","revenue","predicted"]].to_string(index=False))`,
  `# ── Plot actual vs predicted ──────────────────────────────
# No new ClickHouse query — reuses the daily DataFrame.
import matplotlib
matplotlib.use("AGG")
import matplotlib.pyplot as plt
import base64, io

fig, ax = plt.subplots(figsize=(10, 4))
fig.patch.set_facecolor("#18181b")
ax.set_facecolor("#18181b")

dates = daily["dt"].astype(str)
ax.bar(dates, daily["revenue"].astype(float), color="#FAFF69", alpha=0.7, label="Actual")
ax.plot(dates, daily["predicted"], color="#f87171", lw=2, marker="o", ms=5, label="Predicted")
ax.set_ylabel("Revenue (€)", color="#FAFF69")
ax.tick_params(colors="#71717a", labelrotation=30)
for s in ax.spines.values(): s.set_color("#3f3f46")
ax.set_title("Daily Revenue — Actual vs Predicted", color="#e4e4e7", fontsize=13)
ax.legend(facecolor="#27272a", edgecolor="#3f3f46", labelcolor="#a1a1aa")
fig.tight_layout()

buf = io.BytesIO()
fig.savefig(buf, format="png", dpi=120, bbox_inches="tight", facecolor="#18181b")
plt.close(fig)
b64 = base64.b64encode(buf.getvalue()).decode()
print(f"<img src='data:image/png;base64,{b64}' style='max-width:100%;border-radius:8px'/>")`,
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function NotebookPanel() {
  const [cells, setCells] = useState<Cell[]>(
    EXAMPLE_CELLS.map((code) => ({
      id: uid(), code, output: "", outputType: "text" as const, queries: [], running: false, showQueries: false,
    })),
  );
  const [pyodide, setPyodide] = useState<PyodideInstance | null>(null);
  const [pyLoading, setPyLoading] = useState(false);
  const [pyReady, setPyReady] = useState(false);
  const [pyError, setPyError] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [savedList, setSavedList] = useState<string[]>([]);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const queryCaptureRef = useRef<CapturedQuery[]>([]);
  const pyodideRef = useRef<PyodideInstance | null>(null);

  const NB_KEY = "clickshop_notebooks";

  const refreshSavedList = useCallback(() => {
    try {
      const raw = localStorage.getItem(NB_KEY);
      if (raw) setSavedList(Object.keys(JSON.parse(raw)));
      else setSavedList([]);
    } catch { setSavedList([]); }
  }, []);

  const saveNotebook = () => {
    const name = prompt("Notebook name:");
    if (!name?.trim()) return;
    try {
      const existing = JSON.parse(localStorage.getItem(NB_KEY) || "{}");
      existing[name.trim()] = {
        savedAt: new Date().toISOString(),
        cells: cells.map((c) => ({ code: c.code })),
      };
      localStorage.setItem(NB_KEY, JSON.stringify(existing));
      setSaveMsg(`Saved "${name.trim()}"`);
      setTimeout(() => setSaveMsg(null), 2000);
      refreshSavedList();
    } catch { /* ignore */ }
  };

  const loadNotebook = (name: string) => {
    try {
      const existing = JSON.parse(localStorage.getItem(NB_KEY) || "{}");
      const nb = existing[name];
      if (nb?.cells) {
        setCells(
          nb.cells.map((c: { code: string }) => ({
            id: uid(),
            code: c.code,
            output: "",
            outputType: "text" as const,
            queries: [],
            running: false,
            showQueries: false,
          })),
        );
      }
      setShowSaved(false);
    } catch { /* ignore */ }
  };

  const deleteNotebook = (name: string) => {
    try {
      const existing = JSON.parse(localStorage.getItem(NB_KEY) || "{}");
      delete existing[name];
      localStorage.setItem(NB_KEY, JSON.stringify(existing));
      refreshSavedList();
    } catch { /* ignore */ }
  };

  const exportNotebook = () => {
    const data = JSON.stringify({ cells: cells.map((c) => ({ code: c.code })) }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notebook-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadPyodide = useCallback(async () => {
    if (pyodideRef.current) return pyodideRef.current;
    setPyLoading(true);
    setPyError(null);
    try {
      if (!window.loadPyodide) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = `${PYODIDE_CDN}pyodide.js`;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Failed to load Pyodide"));
          document.head.appendChild(script);
        });
      }

      const py = await window.loadPyodide!({ indexURL: PYODIDE_CDN });

      await py.loadPackagesFromImports("import pandas, numpy");

      const captureRef = queryCaptureRef;

      const bridge = {
        execute_query_sync: (sql: string) => {
          const t0 = performance.now();
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/sql/execute", false);
          xhr.setRequestHeader("Content-Type", "application/json");
          xhr.send(JSON.stringify({ query: sql, database: "clickhouse" }));
          const durationMs = Math.round(performance.now() - t0);
          const data = JSON.parse(xhr.responseText);
          captureRef.current.push({
            sql,
            durationMs,
            rowCount: data.rowCount ?? 0,
          });
          if (data.error) throw new Error(data.error);
          return xhr.responseText;
        },
      };

      // @ts-expect-error registerJsModule exists on pyodide
      py.registerJsModule("_chdb_bridge", bridge);

      await py.runPythonAsync(`
import json as _json

class _ChDBModule:
    """chDB mock — routes SQL to ClickHouse Cloud via API"""

    def _exec(self, sql):
        import _chdb_bridge
        raw = _chdb_bridge.execute_query_sync(sql)
        return _json.loads(raw)

    def query(self, sql, output_format="Pretty"):
        data = self._exec(sql)
        if not data.get("columns") or not data.get("rows"):
            return f"OK. {data.get('rowCount', 0)} rows affected."
        cols = data["columns"]
        rows = data["rows"]
        widths = [len(c) for c in cols]
        str_rows = []
        for r in rows:
            row_strs = [str(r.get(c, "")) for c in cols]
            for i, s in enumerate(row_strs):
                widths[i] = max(widths[i], len(s))
            str_rows.append(row_strs)
        header = " | ".join(c.ljust(widths[i]) for i, c in enumerate(cols))
        sep = "-+-".join("-" * widths[i] for i in range(len(cols)))
        lines = [header, sep]
        for row_strs in str_rows:
            lines.append(" | ".join(row_strs[i].ljust(widths[i]) for i in range(len(cols))))
        return "\\n".join(lines)

    def query_json(self, sql):
        data = self._exec(sql)
        return data.get("rows", [])

    def query_df(self, sql):
        rows = self.query_json(sql)
        try:
            import pandas as pd
            return pd.DataFrame(rows)
        except ImportError:
            return rows


class DataStore:
    """Lazy DataFrame — chains operations, compiles to SQL, executes on ClickHouse."""

    def __init__(self, table=None, sql=None):
        self._table = table
        self._raw_sql = sql
        self._filters = []
        self._columns = None
        self._sort_key = None
        self._sort_asc = True
        self._limit_n = None
        self._group_cols = None
        self._agg_exprs = None

    @staticmethod
    def table(name):
        return DataStore(table=name)

    @staticmethod
    def from_sql(sql):
        return DataStore(sql=sql)

    def select(self, *cols):
        ds = self._clone()
        ds._columns = list(cols)
        return ds

    def filter(self, expr):
        ds = self._clone()
        ds._filters.append(expr)
        return ds

    def __getitem__(self, expr):
        if isinstance(expr, str):
            ds = self._clone()
            ds._columns = [expr]
            return ds
        return self.filter(expr)

    def sort_values(self, col, ascending=True):
        ds = self._clone()
        ds._sort_key = col
        ds._sort_asc = ascending
        return ds

    def head(self, n=10):
        ds = self._clone()
        ds._limit_n = n
        return ds

    def group_by(self, *cols):
        ds = self._clone()
        ds._group_cols = list(cols)
        return ds

    def agg(self, **exprs):
        ds = self._clone()
        ds._agg_exprs = exprs
        return ds

    def _clone(self):
        ds = DataStore(table=self._table, sql=self._raw_sql)
        ds._filters = list(self._filters)
        ds._columns = list(self._columns) if self._columns else None
        ds._sort_key = self._sort_key
        ds._sort_asc = self._sort_asc
        ds._limit_n = self._limit_n
        ds._group_cols = list(self._group_cols) if self._group_cols else None
        ds._agg_exprs = dict(self._agg_exprs) if self._agg_exprs else None
        return ds

    def to_sql(self):
        source = self._raw_sql if self._raw_sql else self._table
        if self._raw_sql:
            source = f"({self._raw_sql})"

        if self._group_cols and self._agg_exprs:
            agg_parts = list(self._group_cols)
            for alias, expr in self._agg_exprs.items():
                agg_parts.append(f"{expr} AS {alias}")
            select_clause = ", ".join(agg_parts)
        elif self._columns:
            select_clause = ", ".join(self._columns)
        else:
            select_clause = "*"

        sql = f"SELECT {select_clause} FROM {source}"

        if self._filters:
            sql += " WHERE " + " AND ".join(f"({f})" for f in self._filters)

        if self._group_cols:
            sql += " GROUP BY " + ", ".join(self._group_cols)

        if self._sort_key:
            direction = "ASC" if self._sort_asc else "DESC"
            sql += f" ORDER BY {self._sort_key} {direction}"

        if self._limit_n:
            sql += f" LIMIT {self._limit_n}"

        return sql

    def collect(self):
        sql = self.to_sql()
        import pandas as pd
        chdb = _ChDBModule()
        rows = chdb.query_json(sql)
        return pd.DataFrame(rows)

    def __repr__(self):
        return f"DataStore(pending) → {self.to_sql()}"

    def __str__(self):
        return self.collect().to_string(index=False)


_chdb = _ChDBModule()
_chdb.DataStore = DataStore

import sys
sys.modules["chdb"] = _chdb
      `);

      pyodideRef.current = py;
      setPyodide(py);
      setPyReady(true);
      return py;
    } catch (err) {
      setPyError((err as Error).message);
      return null;
    } finally {
      setPyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPyodide();
  }, [loadPyodide]);

  const updateCell = (id: string, patch: Partial<Cell>) =>
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addCell = (afterId?: string) => {
    const newCell: Cell = {
      id: uid(),
      code: "",
      output: "",
      outputType: "text",
      queries: [],
      running: false,
      showQueries: false,
    };
    setCells((prev) => {
      if (!afterId) return [...prev, newCell];
      const idx = prev.findIndex((c) => c.id === afterId);
      const copy = [...prev];
      copy.splice(idx + 1, 0, newCell);
      return copy;
    });
  };

  const deleteCell = (id: string) =>
    setCells((prev) => (prev.length <= 1 ? prev : prev.filter((c) => c.id !== id)));

  const runCell = async (id: string) => {
    let py = pyodideRef.current;
    if (!py) {
      py = await loadPyodide();
      if (!py) return;
    }

    const cell = cells.find((c) => c.id === id);
    if (!cell) return;

    updateCell(id, { running: true, output: "", outputType: "text", queries: [], tableData: undefined });
    queryCaptureRef.current = [];

    const code = cell.code.trim();

    if (code.startsWith("!pip install") || code.startsWith("%pip install")) {
      const pkg = code.replace(/^[!%]pip install\s+/, "").trim();
      try {
        await py.runPythonAsync(`import micropip; await micropip.install("${pkg}")`);
        updateCell(id, { running: false, output: `Installed ${pkg}`, outputType: "text" });
      } catch (err) {
        updateCell(id, { running: false, output: `Failed to install ${pkg}: ${(err as Error).message}`, outputType: "error" });
      }
      return;
    }

    try {
      await py.loadPackagesFromImports(code);

      let captured = "";
      await py.runPythonAsync(`
import sys, io
_old_stdout = sys.stdout
sys.stdout = _capture_buf = io.StringIO()
      `);

      const result = await py.runPythonAsync(code);

      await py.runPythonAsync(`
sys.stdout = _old_stdout
      `);
      const stdout = await py.runPythonAsync(`_capture_buf.getvalue()`);
      captured = String(stdout ?? "");

      let outputText = captured;
      if (result !== undefined && result !== null && String(result) !== "None") {
        const repr = String(result);
        if (!captured.includes(repr)) {
          outputText = outputText ? outputText + "\n" + repr : repr;
        }
      }

      const queries = [...queryCaptureRef.current];

      if (queries.length === 1 && !outputText.trim()) {
        try {
          const res = await fetch("/api/sql/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: queries[0].sql, database: "clickhouse" }),
          });
          const data = await res.json();
          if (data.columns?.length && data.rows?.length) {
            updateCell(id, {
              running: false,
              output: "",
              outputType: "table",
              tableData: { columns: data.columns, rows: data.rows },
              queries,
            });
            return;
          }
        } catch { /* fall through */ }
      }

      updateCell(id, {
        running: false,
        output: outputText || "(no output)",
        outputType: "text",
        queries,
      });
    } catch (err) {
      await py.runPythonAsync(`
try:
    sys.stdout = _old_stdout
except:
    pass
      `);
      updateCell(id, {
        running: false,
        output: (err as Error).message,
        outputType: "error",
        queries: [...queryCaptureRef.current],
      });
    }
  };

  const runAll = async () => {
    for (const cell of cells) {
      await runCell(cell.id);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-[--border] px-4 py-2">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-4 w-4 text-[--brand]" />
          <span className="text-sm font-medium text-[--fg]">Python Notebook</span>
          <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
            chDB
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {pyLoading && (
            <span className="flex items-center gap-1.5 text-xs text-[--muted]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading Python...
            </span>
          )}
          {pyReady && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-500">
              <CheckCircle2 className="h-3 w-3" />
              Pyodide ready
            </span>
          )}
          {pyError && (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertCircle className="h-3 w-3" />
              {pyError}
            </span>
          )}
          {saveMsg && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3 w-3" /> {saveMsg}
            </span>
          )}
          <button
            onClick={saveNotebook}
            className="flex items-center gap-1.5 rounded-lg border border-[--border] px-3 py-1.5 text-xs font-medium text-[--muted-fg] transition-colors hover:bg-[--surface-hover] hover:text-[--fg]"
            title="Save notebook"
          >
            <Save className="h-3 w-3" />
            Save
          </button>
          <div className="relative">
            <button
              onClick={() => { setShowSaved(!showSaved); refreshSavedList(); }}
              className="flex items-center gap-1.5 rounded-lg border border-[--border] px-3 py-1.5 text-xs font-medium text-[--muted-fg] transition-colors hover:bg-[--surface-hover] hover:text-[--fg]"
              title="Load notebook"
            >
              <FolderOpen className="h-3 w-3" />
              Load
            </button>
            {showSaved && (
              <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-[--border] bg-[--surface-solid] p-2 shadow-xl">
                <p className="mb-1 px-2 text-[10px] font-medium text-[--muted]">Saved notebooks</p>
                {savedList.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-[--muted]">No saved notebooks</p>
                )}
                {savedList.map((name) => (
                  <div key={name} className="flex items-center gap-1 rounded px-2 py-1.5 text-xs text-[--muted-fg] hover:bg-[--surface-hover] hover:text-[--fg]">
                    <button onClick={() => loadNotebook(name)} className="flex-1 truncate text-left">
                      {name}
                    </button>
                    <button onClick={() => deleteNotebook(name)} className="shrink-0 text-[--muted] hover:text-red-400" title="Delete">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={exportNotebook}
            className="rounded-lg border border-[--border] p-1.5 text-[--muted] transition-colors hover:bg-[--surface-hover] hover:text-[--fg]"
            title="Export as JSON"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <div className="mx-1 h-4 w-px bg-[--border]" />
          <button
            onClick={runAll}
            disabled={!pyReady}
            className="flex items-center gap-1.5 rounded-lg bg-brand-400 px-3 py-1.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-brand-300 disabled:opacity-50 dark:text-zinc-950"
          >
            <Play className="h-3 w-3" />
            Run All
          </button>
          <button
            onClick={() => addCell()}
            className="flex items-center gap-1.5 rounded-lg border border-[--border] px-3 py-1.5 text-xs font-medium text-[--muted-fg] transition-colors hover:bg-[--surface-hover] hover:text-[--fg]"
          >
            <Plus className="h-3 w-3" />
            Cell
          </button>
          <button
            onClick={() => {
              pyodideRef.current = null;
              setPyodide(null);
              setPyReady(false);
              loadPyodide();
            }}
            className="rounded-lg border border-[--border] p-1.5 text-[--muted] transition-colors hover:bg-[--surface-hover] hover:text-[--fg]"
            title="Restart kernel"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Cells */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {cells.map((cell, idx) => (
          <div
            key={cell.id}
            className={`rounded-xl border transition-colors ${
              cell.running ? "border-[--brand]/40 bg-[--brand-dim]" : "border-[--border] bg-[--surface]"
            }`}
          >
            {/* Cell header */}
            <div className="flex items-center gap-2 border-b border-[--border-subtle] px-3 py-1.5">
              <span className="flex items-center gap-1 text-[10px] font-medium text-[--muted]">
                <Code2 className="h-3 w-3" />
                In [{idx + 1}]
              </span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => runCell(cell.id)}
                  disabled={cell.running || !pyReady}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-[--muted-fg] transition-colors hover:bg-[--surface-hover] hover:text-[--fg] disabled:opacity-50"
                  title="Run cell (Shift+Enter)"
                >
                  {cell.running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  Run
                </button>
                <button
                  onClick={() => addCell(cell.id)}
                  className="rounded p-1 text-[--muted] transition-colors hover:bg-[--surface-hover] hover:text-[--fg]"
                  title="Add cell below"
                >
                  <Plus className="h-3 w-3" />
                </button>
                <button
                  onClick={() => deleteCell(cell.id)}
                  disabled={cells.length <= 1}
                  className="rounded p-1 text-[--muted] transition-colors hover:bg-[--surface-hover] hover:text-red-400 disabled:opacity-30"
                  title="Delete cell"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Code area */}
            <CodeEditor
              value={cell.code}
              onChange={(v) => updateCell(cell.id, { code: v })}
              language="python"
              placeholder="# Write Python code here\nimport chdb\nresult = chdb.query('SELECT 1')"
              minHeight="80px"
              onKeyDown={(e) => {
                if (e.shiftKey && e.key === "Enter") {
                  e.preventDefault();
                  runCell(cell.id);
                }
              }}
            />

            {/* Output */}
            {(cell.output || cell.tableData) && (
              <div className="border-t border-[--border-subtle]">
                {/* Query badge */}
                {cell.queries.length > 0 && (
                  <div className="px-3 pt-2">
                    <button
                      onClick={() => updateCell(cell.id, { showQueries: !cell.showQueries })}
                      className="flex items-center gap-1.5 rounded-md border border-[--border-subtle] bg-[--surface] px-2 py-1 text-[10px] font-medium text-[--muted] transition-colors hover:text-[--fg]"
                    >
                      <Database className="h-3 w-3" />
                      {cell.queries.length} ClickHouse {cell.queries.length === 1 ? "query" : "queries"}
                      {cell.showQueries ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                    {cell.showQueries && (
                      <div className="mt-2 space-y-1.5">
                        {cell.queries.map((q, qi) => (
                          <div key={qi} className="rounded-lg bg-[--bg] p-2.5">
                            <pre className="whitespace-pre-wrap font-mono text-[11px] text-[--brand]">{q.sql}</pre>
                            <div className="mt-1 flex gap-3 text-[10px] text-[--muted]">
                              <span>{q.rowCount} rows</span>
                              <span>{q.durationMs}ms</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Table output */}
                {cell.tableData && (
                  <div className="max-h-[300px] overflow-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-[--surface-solid] backdrop-blur">
                        <tr>
                          {cell.tableData.columns.map((col) => (
                            <th key={col} className="max-w-[180px] truncate px-3 py-1.5 font-medium text-[--muted-fg]">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cell.tableData.rows.map((row, ri) => (
                          <tr key={ri} className="border-t border-[--border-subtle] hover:bg-[--surface-hover]">
                            {cell.tableData!.columns.map((col) => (
                              <td key={col} className="max-w-[180px] truncate px-3 py-1 text-[--fg]">
                                {row[col] === null ? <span className="text-[--muted]">NULL</span> : String(row[col])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Text / error / HTML output */}
                {cell.output && (
                  cell.output.includes("<img ") || cell.output.includes("<div ") || cell.output.includes("<svg ") ? (
                    <div
                      className="max-h-[500px] overflow-auto px-4 py-3"
                      dangerouslySetInnerHTML={{ __html: cell.output }}
                    />
                  ) : (
                    <pre
                      className={`max-h-[300px] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs ${
                        cell.outputType === "error" ? "text-red-400" : "text-[--fg]"
                      }`}
                    >
                      {cell.output}
                    </pre>
                  )
                )}
              </div>
            )}
          </div>
        ))}

        {/* Hints */}
        <div className="flex flex-wrap gap-3 pt-2 text-[10px] text-[--muted]">
          <span className="flex items-center gap-1"><Code2 className="h-3 w-3" /> Shift+Enter to run cell</span>
          <span className="flex items-center gap-1"><Package className="h-3 w-3" /> <code>!pip install pandas</code> to add libraries</span>
          <span className="flex items-center gap-1"><Database className="h-3 w-3" /> <code>import chdb</code> routes to ClickHouse Cloud</span>
        </div>
      </div>
    </div>
  );
}
