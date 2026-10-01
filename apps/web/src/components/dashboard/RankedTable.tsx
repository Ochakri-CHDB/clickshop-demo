"use client";

interface Column<T> {
  key: keyof T;
  label: string;
  format?: "currency" | "percent" | "number" | "change";
  align?: "left" | "right";
}

interface RankedTableProps<T> {
  title: string;
  data: T[];
  columns: Column<T>[];
  queryTimeMs?: number;
}

function formatCell(value: unknown, format?: string): string {
  if (value === null || value === undefined) return "\u2014";
  const num = Number(value);
  switch (format) {
    case "currency":
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(num);
    case "percent":
      return `${num.toFixed(1)}%`;
    case "number":
      return new Intl.NumberFormat("en-US").format(num);
    case "change":
      return `${num >= 0 ? "+" : ""}${num.toFixed(1)}%`;
    default:
      return String(value);
  }
}

export function RankedTable<T extends Record<string, unknown>>({
  title,
  data,
  columns,
  queryTimeMs,
}: RankedTableProps<T>) {
  return (
    <div
      className="rounded-xl border border-[--border] bg-[--surface] p-4 transition-all duration-200 hover:shadow-md"
      style={{ boxShadow: `0 1px 3px var(--card-shadow)` }}
    >
      <h3 className="mb-3 text-sm font-semibold text-[--fg]">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th className="pb-2 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-[--muted]">#</th>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={`pb-2 pr-4 text-[10px] font-semibold uppercase tracking-wider text-[--muted] ${col.align === "right" ? "text-right" : "text-left"}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                className="transition-colors hover:bg-[--surface-hover]"
                style={{ borderBottom: i < data.length - 1 ? "1px solid var(--border-subtle)" : "none" }}
              >
                <td className="py-1.5 pr-4 text-xs text-[--muted] tabular-nums">{i + 1}</td>
                {columns.map((col) => {
                  const raw = row[col.key];
                  const formatted = formatCell(raw, col.format);
                  const isChange = col.format === "change" && typeof raw === "number";
                  const isNumeric = col.format !== undefined;
                  return (
                    <td
                      key={String(col.key)}
                      className={`py-1.5 pr-4 ${isNumeric ? "tabular-nums" : ""} ${col.align === "right" ? "text-right" : "text-left"} ${
                        isChange ? (raw as number) >= 0 ? "text-emerald-400" : "text-red-400" : "text-[--fg]"
                      }`}
                    >
                      {formatted}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {queryTimeMs !== undefined && queryTimeMs > 0 && (
        <p className="mt-2 text-right text-[9px] tabular-nums text-[--muted]" style={{ opacity: 0.5 }}>
          Query: {queryTimeMs}ms
        </p>
      )}
    </div>
  );
}
