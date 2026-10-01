export function rangeToFilter(range: string | null): {
  kpiWhere: string;
  trendWhere: string;
  trendGroup: string;
} {
  switch (range) {
    case "1h":
      return {
        kpiWhere: "event_time >= now() - INTERVAL 1 HOUR",
        trendWhere: "event_time >= now() - INTERVAL 1 HOUR",
        trendGroup: "toStartOfMinute(event_time)",
      };
    case "6h":
      return {
        kpiWhere: "event_time >= now() - INTERVAL 6 HOUR",
        trendWhere: "event_time >= now() - INTERVAL 6 HOUR",
        trendGroup: "toStartOfFiveMinutes(event_time)",
      };
    case "1d":
      return {
        kpiWhere: "event_time >= now() - INTERVAL 1 DAY",
        trendWhere: "event_time >= now() - INTERVAL 1 DAY",
        trendGroup: "toStartOfHour(event_time)",
      };
    case "7d":
      return {
        kpiWhere: "event_time >= now() - INTERVAL 7 DAY",
        trendWhere: "event_time >= now() - INTERVAL 7 DAY",
        trendGroup: "toDate(event_time)",
      };
    case "30d":
      return {
        kpiWhere: "event_time >= now() - INTERVAL 30 DAY",
        trendWhere: "event_time >= now() - INTERVAL 30 DAY",
        trendGroup: "toDate(event_time)",
      };
    default: // "today"
      return {
        kpiWhere: "event_time >= today()",
        trendWhere: "event_time >= today()",
        trendGroup: "toStartOfFiveMinutes(event_time)",
      };
  }
}

const FILTER_VALUE_RE = /^[\p{L}\p{N} _.&/-]{1,64}$/u;

/**
 * Builds `col = 'value'` dashboard filters. Values are interpolated into
 * ClickHouse SQL, so only a strict character allowlist is accepted (no quotes,
 * no backslashes); anything else drops the filter.
 */
export function buildEqualityFilters(
  params: URLSearchParams,
  mapping: Record<string, string>,
  alias = "",
): string {
  const pre = alias ? `${alias}.` : "";
  const parts: string[] = [];
  for (const [param, column] of Object.entries(mapping)) {
    const value = params.get(param);
    if (value && FILTER_VALUE_RE.test(value)) parts.push(`${pre}${column} = '${value}'`);
  }
  return parts.length ? " AND " + parts.join(" AND ") : "";
}

/**
 * Pick the right time bucket based on actual data span.
 * Call this AFTER querying for dataBounds.
 */
export function adaptiveTrendGroup(dataSpanMinutes: number): string {
  if (dataSpanMinutes <= 10) return "toStartOfMinute(event_time)";
  if (dataSpanMinutes <= 120) return "toStartOfFiveMinutes(event_time)";
  if (dataSpanMinutes <= 1440) return "toStartOfHour(event_time)";
  if (dataSpanMinutes <= 10080) return "toDate(event_time)";
  return "toStartOfWeek(event_time)";
}
